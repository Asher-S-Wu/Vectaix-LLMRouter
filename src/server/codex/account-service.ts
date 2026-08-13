import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import type { CodexCredentialDocument } from "@/server/db/types";
import {
  getCodexAuthSessionCollection,
  getCodexCredentialCollection,
} from "@/server/db";
import {
  decryptCodexAccessToken,
  decryptCodexDeviceAuthId,
  decryptCodexDeviceUserCode,
  decryptCodexRefreshToken,
  encryptCodexAccessToken,
  encryptCodexDeviceAuthId,
  encryptCodexDeviceUserCode,
  encryptCodexRefreshToken,
} from "@/server/codex/crypto";
import {
  fetchChatGptWithCloudflareCookies,
} from "@/server/codex/chatgpt-cloudflare-fetch";

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const DEVICE_AUTH_URL =
  "https://auth.openai.com/api/accounts/deviceauth/usercode";
const DEVICE_TOKEN_URL =
  "https://auth.openai.com/api/accounts/deviceauth/token";
const DEVICE_VERIFICATION_URL = "https://auth.openai.com/codex/device";
const OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OAUTH_REVOKE_URL = "https://auth.openai.com/oauth/revoke";
const OAUTH_REDIRECT_URI = "https://auth.openai.com/deviceauth/callback";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const MODELS_URL =
  "https://chatgpt.com/backend-api/codex/models?client_version=0.147.0";
const CODEX_CLIENT_VERSION = "0.147.0";
const CODEX_ORIGINATOR = "vectaix_llmrouter";
const CODEX_USER_AGENT = "Vectaix-LLMRouter/1.0.0";
const OPENAI_AUTH_CLAIM = "https://api.openai.com/auth";
const OPENAI_PROFILE_CLAIM = "https://api.openai.com/profile";

const AUTH_SESSION_LIFETIME_MS = 15 * 60 * 1_000;
const REFRESH_WINDOW_MS = 5 * 60 * 1_000;
const REFRESH_LEASE_MS = 30 * 1_000;
const DISCONNECT_LEASE_MS = 30 * 1_000;
const POLL_LEASE_MS = 90 * 1_000;
const UPSTREAM_TIMEOUT_MS = 20 * 1_000;
const DEVICE_CODE_LENGTH = 43;
const MAX_UPSTREAM_VALUE_LENGTH = 8_192;
const MAX_FAILURE_MESSAGE_LENGTH = 200;
const JWT_BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type CodexAccountStatus =
  | { state: "disconnected" }
  | {
      state: "connected" | "reconnect_required";
      email: string | null;
      plan: string | null;
      tokenExpiresAt: string;
      connectedAt: string;
      updatedAt: string;
      failureMessage: string | null;
    };

export interface CodexDeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresAt: string;
  intervalSeconds: number;
}

export type CodexDevicePollResult =
  | { status: "pending" }
  | { status: "connected" };

export interface CodexAccessCredentials {
  accessToken: string;
  accountId: string;
  refreshVersion: number;
}

export interface CodexUsageWindow {
  usedPercent: number;
  windowMinutes: number | null;
  resetsAt: string | null;
}

export interface CodexUsageCredits {
  hasCredits: boolean;
  unlimited: boolean;
  overageLimitReached: boolean;
  balance: string | null;
}

export interface CodexAdditionalRateLimit {
  name: string;
  meteredFeature: string;
  primaryWindow: CodexUsageWindow | null;
  secondaryWindow: CodexUsageWindow | null;
}

export interface CodexSpendControlLimit {
  limit: string;
  used: string;
  remaining: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: string;
}

export interface CodexSpendControl {
  reached: boolean;
  individualLimit: CodexSpendControlLimit | null;
}

export interface CodexUsage {
  planName: string | null;
  primaryWindow: CodexUsageWindow | null;
  secondaryWindow: CodexUsageWindow | null;
  codeReviewWindow: CodexUsageWindow | null;
  additionalRateLimits: CodexAdditionalRateLimit[];
  credits: CodexUsageCredits | null;
  resetCreditsAvailable: number | null;
  spendControlReached: boolean | null;
  spendControl: CodexSpendControl | null;
  updatedAt: string;
}

export interface CodexOverview {
  account: CodexAccountStatus;
  quota: CodexUsage | null;
}

export class CodexValidationError extends Error {
  readonly code = "CODEX_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "CodexValidationError";
  }
}

export class CodexUpstreamError extends Error {
  readonly code = "CODEX_UPSTREAM_ERROR";
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "CodexUpstreamError";
    this.status = status;
  }
}

export class CodexReconnectRequiredError extends Error {
  readonly code = "CODEX_RECONNECT_REQUIRED";

  constructor(message = "Codex 授权已失效，请重新连接") {
    super(message);
    this.name = "CodexReconnectRequiredError";
  }
}

interface JwtIdentity {
  accountId: string | null;
  email: string | null;
  plan: string | null;
  expiresAt: Date | null;
}

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
  idToken: string | null;
}

interface ResolvedTokenBundle extends TokenBundle {
  identity: JwtIdentity & { accountId: string; expiresAt: Date };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    isRecord(error) &&
    error.code === 11_000
  );
}

function requiredString(
  value: unknown,
  field: string,
  maxLength = MAX_UPSTREAM_VALUE_LENGTH,
): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > maxLength
  ) {
    throw new CodexUpstreamError(`Codex 返回的 ${field} 格式不正确`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  field: string,
  maxLength = MAX_UPSTREAM_VALUE_LENGTH,
): string | undefined {
  if (!(field in record)) return undefined;
  return requiredString(record[field], field, maxLength);
}

async function readJsonRecord(
  response: Response,
  context: string,
): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CodexUpstreamError(`${context}返回了无法识别的数据`, response.status);
  }
  if (!isRecord(payload)) {
    throw new CodexUpstreamError(`${context}返回了无法识别的数据`, response.status);
  }
  return payload;
}

async function upstreamFetch(
  url: string,
  init: RequestInit,
  context: string,
): Promise<Response> {
  try {
    const requestInit: RequestInit = {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    };
    return new URL(url).origin === "https://chatgpt.com"
      ? await fetchChatGptWithCloudflareCookies(url, requestInit)
      : await fetch(url, requestInit);
  } catch {
    throw new CodexUpstreamError(`无法连接${context}`);
  }
}

function parseDeviceCode(deviceCode: string): string {
  const normalized = deviceCode.trim();
  if (
    normalized.length !== DEVICE_CODE_LENGTH ||
    !JWT_BASE64URL_PATTERN.test(normalized)
  ) {
    throw new CodexValidationError("Codex 连接编号无效");
  }
  return normalized;
}

function parseJwtClaims(token: string): Record<string, unknown> {
  const [header, payload, signature, extra] = token.split(".");
  if (
    !header ||
    !payload ||
    !signature ||
    extra !== undefined ||
    !JWT_BASE64URL_PATTERN.test(header) ||
    !JWT_BASE64URL_PATTERN.test(payload) ||
    !JWT_BASE64URL_PATTERN.test(signature)
  ) {
    throw new CodexUpstreamError("Codex 返回的登录令牌格式不正确");
  }

  let decoded: string;
  try {
    const bytes = Buffer.from(payload, "base64url");
    if (bytes.toString("base64url") !== payload) {
      throw new Error("non-canonical base64url");
    }
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CodexUpstreamError("Codex 返回的登录令牌格式不正确");
  }

  let claims: unknown;
  try {
    claims = JSON.parse(decoded);
  } catch {
    throw new CodexUpstreamError("Codex 返回的登录令牌格式不正确");
  }
  if (!isRecord(claims)) {
    throw new CodexUpstreamError("Codex 返回的登录令牌格式不正确");
  }
  return claims;
}

function claimString(
  record: Record<string, unknown>,
  field: string,
): string | null {
  if (!(field in record)) return null;
  const value = record[field];
  if (typeof value !== "string" || !value || value.length > 500) {
    throw new CodexUpstreamError("Codex 登录令牌中的账户信息格式不正确");
  }
  return value;
}

function claimRecord(
  claims: Record<string, unknown>,
  field: string,
): Record<string, unknown> | null {
  if (!(field in claims)) return null;
  const value = claims[field];
  if (!isRecord(value)) {
    throw new CodexUpstreamError("Codex 登录令牌中的账户信息格式不正确");
  }
  return value;
}

function reconcileClaim(
  first: string | null,
  second: string | null,
): string | null {
  if (first && second && first !== second) {
    throw new CodexUpstreamError("Codex 登录令牌中的账户信息不一致");
  }
  return first ?? second;
}

function parseJwtIdentity(token: string): JwtIdentity {
  const claims = parseJwtClaims(token);
  const auth = claimRecord(claims, OPENAI_AUTH_CLAIM);
  const profile = claimRecord(claims, OPENAI_PROFILE_CLAIM);

  const directEmail = claimString(claims, "email");
  const profileEmail = profile ? claimString(profile, "email") : null;
  const email = reconcileClaim(directEmail, profileEmail);
  const accountId = auth ? claimString(auth, "chatgpt_account_id") : null;
  const plan = auth ? claimString(auth, "chatgpt_plan_type") : null;

  let expiresAt: Date | null = null;
  if ("exp" in claims) {
    const exp = claims.exp;
    if (!Number.isSafeInteger(exp) || (exp as number) <= 0) {
      throw new CodexUpstreamError("Codex 登录令牌的有效期格式不正确");
    }
    expiresAt = new Date((exp as number) * 1_000);
  }

  return { accountId, email, plan, expiresAt };
}

function combineTokenIdentities(
  accessToken: string,
  idToken: string | null,
): JwtIdentity & { accountId: string; expiresAt: Date } {
  const access = parseJwtIdentity(accessToken);
  const identity = idToken ? parseJwtIdentity(idToken) : null;
  const accountId = reconcileClaim(access.accountId, identity?.accountId ?? null);
  if (!accountId) {
    throw new CodexUpstreamError("Codex 登录令牌中缺少账户编号");
  }
  if (!access.expiresAt || access.expiresAt.getTime() <= Date.now()) {
    throw new CodexUpstreamError("Codex 返回的访问令牌已经失效");
  }
  return {
    accountId,
    email: reconcileClaim(access.email, identity?.email ?? null),
    plan: reconcileClaim(access.plan, identity?.plan ?? null),
    expiresAt: access.expiresAt,
  };
}

function parseInitialTokenBundle(
  payload: Record<string, unknown>,
  refreshToken: string,
): ResolvedTokenBundle {
  const accessToken = requiredString(payload.access_token, "access_token");
  const idToken = requiredString(payload.id_token, "id_token");
  return {
    accessToken,
    refreshToken,
    idToken,
    identity: combineTokenIdentities(accessToken, idToken),
  };
}

function toAccountStatus(
  document: CodexCredentialDocument,
): Exclude<CodexAccountStatus, { state: "disconnected" }> {
  return {
    state: document.status,
    email: document.email,
    plan: document.plan,
    tokenExpiresAt: document.accessTokenExpiresAt.toISOString(),
    connectedAt: document.connectedAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    failureMessage: document.failureMessage,
  };
}

function normalizeFailureMessage(reason?: string): string {
  if (reason === "upstream_unauthorized") {
    return "Codex 授权已失效，请重新连接";
  }
  const normalized = reason?.trim();
  return normalized
    ? normalized.slice(0, MAX_FAILURE_MESSAGE_LENGTH)
    : "Codex 授权已失效，请重新连接";
}

async function releaseLease(leaseId: string): Promise<void> {
  const credentials = await getCodexCredentialCollection();
  await credentials.updateOne(
    { _id: "primary", refreshLeaseId: leaseId },
    {
      $set: {
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
      },
    },
  );
}

async function markRefreshFailure(
  leaseId: string,
  refreshVersion: number,
  message: string,
): Promise<void> {
  const credentials = await getCodexCredentialCollection();
  await credentials.updateOne(
    { _id: "primary", refreshLeaseId: leaseId, refreshVersion },
    {
      $set: {
        status: "reconnect_required",
        failureMessage: normalizeFailureMessage(message),
        updatedAt: new Date(),
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
      },
    },
  );
}

async function refreshCredential(
  credential: CodexCredentialDocument,
  leaseId: string,
): Promise<CodexAccessCredentials> {
  try {
    const oldAccessToken = decryptCodexAccessToken(
      credential.accessTokenEncrypted,
    );
    const oldRefreshToken = decryptCodexRefreshToken(
      credential.refreshTokenEncrypted,
    );
    const response = await upstreamFetch(
      OAUTH_TOKEN_URL,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: CODEX_CLIENT_ID,
          grant_type: "refresh_token",
          refresh_token: oldRefreshToken,
        }),
      },
      " Codex 授权服务",
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new CodexUpstreamError(
        `Codex 令牌刷新失败，上游返回 ${response.status}`,
        response.status,
      );
    }

    const payload = await readJsonRecord(response, "Codex 授权服务");
    const accessToken =
      optionalString(payload, "access_token") ?? oldAccessToken;
    const refreshToken =
      optionalString(payload, "refresh_token") ?? oldRefreshToken;
    const idToken = optionalString(payload, "id_token") ?? null;
    const identity = combineTokenIdentities(accessToken, idToken);
    if (identity.accountId !== credential.accountId) {
      throw new CodexUpstreamError("刷新后的 Codex 账户与当前账户不一致");
    }

    const credentials = await getCodexCredentialCollection();
    const now = new Date();
    const result = await credentials.updateOne(
      {
        _id: "primary",
        status: "connected",
        refreshLeaseId: leaseId,
        refreshVersion: credential.refreshVersion,
      },
      {
        $set: {
          accessTokenEncrypted: encryptCodexAccessToken(accessToken),
          refreshTokenEncrypted: encryptCodexRefreshToken(refreshToken),
          accessTokenExpiresAt: identity.expiresAt,
          email: identity.email ?? credential.email,
          plan: identity.plan ?? credential.plan,
          updatedAt: now,
          failureMessage: null,
          refreshLeaseId: null,
          refreshLeaseExpiresAt: null,
        },
        $inc: { refreshVersion: 1 },
      },
    );
    if (result.matchedCount !== 1) {
      throw new CodexReconnectRequiredError(
        "Codex 账户状态已改变，请重新连接",
      );
    }
    return {
      accessToken,
      accountId: credential.accountId,
      refreshVersion: credential.refreshVersion + 1,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Codex 令牌刷新失败，请重新连接";
    await markRefreshFailure(leaseId, credential.refreshVersion, message);
    throw new CodexReconnectRequiredError(message);
  }
}

async function validateCodexCredentials(
  accessToken: string,
  accountId: string,
): Promise<void> {
  const response = await upstreamFetch(
    MODELS_URL,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "ChatGPT-Account-ID": accountId,
        originator: CODEX_ORIGINATOR,
        version: CODEX_CLIENT_VERSION,
        "User-Agent": CODEX_USER_AGENT,
      },
    },
    " Codex 模型服务",
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new CodexUpstreamError(
      `Codex 账户验证失败，上游返回 ${response.status}`,
      response.status,
    );
  }
  const payload = await readJsonRecord(response, "Codex 模型服务");
  if (!Array.isArray(payload.models)) {
    throw new CodexUpstreamError("Codex 模型服务返回了无法识别的数据");
  }
}

async function revokeCodexRefreshToken(refreshToken: string): Promise<void> {
  const response = await upstreamFetch(
    OAUTH_REVOKE_URL,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: refreshToken,
        token_type_hint: "refresh_token",
        client_id: CODEX_CLIENT_ID,
      }),
    },
    " Codex 授权服务",
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new CodexUpstreamError(
      `Codex 授权撤销失败，上游返回 ${response.status}`,
      response.status,
    );
  }
  await response.body?.cancel();
}

export async function getCodexAccountStatus(): Promise<CodexAccountStatus> {
  const credentials = await getCodexCredentialCollection();
  const document = await credentials.findOne({ _id: "primary" });
  return document ? toAccountStatus(document) : { state: "disconnected" };
}

export async function startCodexDeviceAuthorization(): Promise<CodexDeviceAuthorization> {
  const [credentials, sessions] = await Promise.all([
    getCodexCredentialCollection(),
    getCodexAuthSessionCollection(),
  ]);
  if (await credentials.findOne({ _id: "primary" }, { projection: { _id: 1 } })) {
    throw new CodexValidationError(
      "当前已有 Codex 账户，请先断开或清除失效连接",
    );
  }

  const now = new Date();
  await sessions.deleteOne({ _id: "active", expiresAt: { $lte: now } });
  const active = await sessions.findOne({ _id: "active" });
  if (active) {
    if (
      active.state !== "pending" ||
      !active.userCodeEncrypted ||
      active.expiresAt.getTime() <= now.getTime()
    ) {
      throw new CodexValidationError("已有一项 Codex 连接正在处理中");
    }
    return {
      deviceCode: active.deviceCode,
      userCode: decryptCodexDeviceUserCode(active.userCodeEncrypted),
      verificationUrl: DEVICE_VERIFICATION_URL,
      expiresAt: active.expiresAt.toISOString(),
      intervalSeconds: active.intervalSeconds,
    };
  }
  const deviceCode = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + AUTH_SESSION_LIFETIME_MS);
  try {
    await sessions.insertOne({
      _id: "active",
      state: "starting",
      deviceCode,
      deviceAuthIdEncrypted: null,
      userCodeEncrypted: null,
      intervalSeconds: 1,
      nextPollAt: expiresAt,
      pollLeaseId: null,
      pollLeaseExpiresAt: null,
      createdAt: now,
      expiresAt,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new CodexValidationError("已有一项 Codex 连接正在等待确认");
    }
    throw error;
  }

  try {
    const response = await upstreamFetch(
      DEVICE_AUTH_URL,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_id: CODEX_CLIENT_ID }),
      },
      " Codex 设备授权服务",
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new CodexUpstreamError(
        `Codex 连接码获取失败，上游返回 ${response.status}`,
        response.status,
      );
    }

    const payload = await readJsonRecord(response, "Codex 设备授权服务");
    const deviceAuthId = requiredString(
      payload.device_auth_id,
      "device_auth_id",
      1_000,
    );
    const userCodeValue = payload.user_code ?? payload.usercode;
    if (
      payload.user_code !== undefined &&
      payload.usercode !== undefined &&
      payload.user_code !== payload.usercode
    ) {
      throw new CodexUpstreamError("Codex 返回的 user_code 信息不一致");
    }
    const userCode = requiredString(userCodeValue, "user_code", 100);
    const interval = payload.interval;
    if (typeof interval !== "string" || !/^[1-9]\d*$/.test(interval)) {
      throw new CodexUpstreamError("Codex 返回的轮询间隔格式不正确");
    }
    const intervalSeconds = Number(interval);
    if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds > 60) {
      throw new CodexUpstreamError("Codex 返回的轮询间隔格式不正确");
    }
    const updated = await sessions.updateOne(
      { _id: "active", state: "starting", deviceCode },
      {
        $set: {
          state: "pending",
          deviceAuthIdEncrypted: encryptCodexDeviceAuthId(deviceAuthId),
          userCodeEncrypted: encryptCodexDeviceUserCode(userCode),
          intervalSeconds,
          nextPollAt: new Date(Date.now() + intervalSeconds * 1_000),
          pollLeaseId: null,
          pollLeaseExpiresAt: null,
        },
      },
    );
    if (updated.matchedCount !== 1) {
      throw new CodexValidationError("本次 Codex 连接已取消");
    }

    return {
      deviceCode,
      userCode,
      verificationUrl: DEVICE_VERIFICATION_URL,
      expiresAt: expiresAt.toISOString(),
      intervalSeconds,
    };
  } catch (error) {
    await sessions.deleteOne({ _id: "active", deviceCode });
    throw error;
  }
}

export async function pollCodexDeviceAuthorization(
  deviceCode: string,
): Promise<CodexDevicePollResult> {
  const normalizedCode = parseDeviceCode(deviceCode);
  const sessions = await getCodexAuthSessionCollection();
  const now = new Date();
  const session = await sessions.findOne({
    _id: "active",
    deviceCode: normalizedCode,
  });
  if (!session) {
    throw new CodexValidationError("没有找到这次 Codex 连接");
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    await sessions.deleteOne({ _id: "active", deviceCode: normalizedCode });
    throw new CodexValidationError("Codex 连接码已过期，请重新连接");
  }
  if (session.state === "starting" || session.nextPollAt.getTime() > now.getTime()) {
    return { status: "pending" };
  }

  const claimed = await sessions.findOneAndUpdate(
    {
      _id: "active",
      state: "pending",
      deviceCode: normalizedCode,
      expiresAt: { $gt: now },
      nextPollAt: { $lte: now },
      $or: [
        { pollLeaseId: null },
        { pollLeaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        nextPollAt: new Date(now.getTime() + session.intervalSeconds * 1_000),
        pollLeaseId: randomUUID(),
        pollLeaseExpiresAt: new Date(now.getTime() + POLL_LEASE_MS),
      },
    },
    { returnDocument: "after" },
  );
  if (!claimed) return { status: "pending" };
  if (!claimed.deviceAuthIdEncrypted || !claimed.userCodeEncrypted) {
    throw new CodexUpstreamError("Codex 连接记录格式不正确");
  }
  const pollLeaseId = claimed.pollLeaseId!;
  try {
    const response = await upstreamFetch(
      DEVICE_TOKEN_URL,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          device_auth_id: decryptCodexDeviceAuthId(
            claimed.deviceAuthIdEncrypted,
          ),
          user_code: decryptCodexDeviceUserCode(claimed.userCodeEncrypted),
        }),
      },
      " Codex 设备授权服务",
    );
    if (response.status === 403 || response.status === 404) {
      await response.body?.cancel();
      return { status: "pending" };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new CodexUpstreamError(
        `Codex 设备授权失败，上游返回 ${response.status}`,
        response.status,
      );
    }

    const devicePayload = await readJsonRecord(
      response,
      "Codex 设备授权服务",
    );
    const authorizationCode = requiredString(
      devicePayload.authorization_code,
      "authorization_code",
    );
    requiredString(devicePayload.code_challenge, "code_challenge");
    const codeVerifier = requiredString(
      devicePayload.code_verifier,
      "code_verifier",
    );

    const tokenResponse = await upstreamFetch(
      OAUTH_TOKEN_URL,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: authorizationCode,
          redirect_uri: OAUTH_REDIRECT_URI,
          client_id: CODEX_CLIENT_ID,
          code_verifier: codeVerifier,
        }),
      },
      " Codex 授权服务",
    );
    if (!tokenResponse.ok) {
      await tokenResponse.body?.cancel();
      throw new CodexUpstreamError(
        `Codex 登录令牌获取失败，上游返回 ${tokenResponse.status}`,
        tokenResponse.status,
      );
    }
    const tokenPayload = await readJsonRecord(tokenResponse, "Codex 授权服务");
    const refreshToken = requiredString(
      tokenPayload.refresh_token,
      "refresh_token",
    );
    let persisted = false;
    try {
      const tokens = parseInitialTokenBundle(tokenPayload, refreshToken);
      await validateCodexCredentials(
        tokens.accessToken,
        tokens.identity.accountId,
      );

      const stillClaimed = await sessions.updateOne(
        {
          _id: "active",
          deviceCode: normalizedCode,
          pollLeaseId,
          pollLeaseExpiresAt: { $gt: new Date() },
        },
        {
          $set: {
            pollLeaseExpiresAt: new Date(Date.now() + POLL_LEASE_MS),
          },
        },
      );
      if (stillClaimed.matchedCount !== 1) {
        throw new CodexValidationError("本次 Codex 连接已取消或处理超时");
      }

      const credentials = await getCodexCredentialCollection();
      const connectedAt = new Date();
      try {
        await credentials.insertOne({
          _id: "primary",
          status: "connected",
          accountId: tokens.identity.accountId,
          email: tokens.identity.email,
          plan: tokens.identity.plan,
          accessTokenEncrypted: encryptCodexAccessToken(tokens.accessToken),
          refreshTokenEncrypted: encryptCodexRefreshToken(tokens.refreshToken),
          accessTokenExpiresAt: tokens.identity.expiresAt,
          connectedAt,
          updatedAt: connectedAt,
          failureMessage: null,
          refreshVersion: 0,
          refreshLeaseId: null,
          refreshLeaseExpiresAt: null,
        });
        persisted = true;
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new CodexValidationError("当前已有一个 Codex 账户");
        }
        throw error;
      }
    } finally {
      if (!persisted) {
        try {
          await revokeCodexRefreshToken(refreshToken);
        } catch (error) {
          throw new CodexUpstreamError(
            "Codex 连接未保存，且无法自动撤销；请到 OpenAI 侧检查并撤销登录会话",
            error instanceof CodexUpstreamError ? error.status : null,
          );
        }
      }
    }
    await sessions.deleteOne({ _id: "active", deviceCode: normalizedCode });
    return { status: "connected" };
  } finally {
    await sessions.updateOne(
      { _id: "active", deviceCode: normalizedCode, pollLeaseId },
      {
        $set: {
          pollLeaseId: null,
          pollLeaseExpiresAt: null,
        },
      },
    );
  }
}

export async function cancelCodexDeviceAuthorization(
  deviceCode: string,
): Promise<boolean> {
  const sessions = await getCodexAuthSessionCollection();
  const now = new Date();
  const result = await sessions.deleteOne({
    _id: "active",
    deviceCode: parseDeviceCode(deviceCode),
    $or: [
      { pollLeaseId: null },
      { pollLeaseExpiresAt: { $lte: now } },
    ],
  });
  if (result.deletedCount === 0) {
    const active = await sessions.findOne(
      { _id: "active" },
      { projection: { deviceCode: 1, pollLeaseExpiresAt: 1 } },
    );
    if (
      active?.deviceCode === parseDeviceCode(deviceCode) &&
      active.pollLeaseExpiresAt &&
      active.pollLeaseExpiresAt.getTime() > now.getTime()
    ) {
      throw new CodexValidationError("Codex 连接正在确认，请稍后再取消");
    }
  }
  return result.deletedCount === 1;
}

export async function markCodexAccountReconnectRequired(
  reason: string | undefined,
  expectedRefreshVersion: number,
): Promise<void> {
  if (!Number.isSafeInteger(expectedRefreshVersion) || expectedRefreshVersion < 0) {
    throw new CodexValidationError("Codex 授权版本无效");
  }
  const credentials = await getCodexCredentialCollection();
  await credentials.updateOne(
    {
      _id: "primary",
      status: "connected",
      refreshLeaseId: null,
      refreshVersion: expectedRefreshVersion,
    },
    {
      $set: {
        status: "reconnect_required",
        failureMessage: normalizeFailureMessage(reason),
        updatedAt: new Date(),
        refreshLeaseId: null,
        refreshLeaseExpiresAt: null,
      },
    },
  );
}

export async function getValidCodexAccessToken(): Promise<CodexAccessCredentials> {
  const credentials = await getCodexCredentialCollection();
  const credential = await credentials.findOne({ _id: "primary" });
  if (!credential) {
    throw new CodexReconnectRequiredError("尚未连接 Codex 账户");
  }
  if (credential.status === "reconnect_required") {
    throw new CodexReconnectRequiredError(
      credential.failureMessage ?? undefined,
    );
  }

  const now = new Date();
  if (
    credential.accessTokenExpiresAt.getTime() >
    now.getTime() + REFRESH_WINDOW_MS
  ) {
    return {
      accessToken: decryptCodexAccessToken(credential.accessTokenEncrypted),
      accountId: credential.accountId,
      refreshVersion: credential.refreshVersion,
    };
  }

  const leaseId = randomUUID();
  const leased = await credentials.findOneAndUpdate(
    {
      _id: "primary",
      status: "connected",
      refreshVersion: credential.refreshVersion,
      accessTokenExpiresAt: {
        $lte: new Date(now.getTime() + REFRESH_WINDOW_MS),
      },
      $or: [
        { refreshLeaseId: null },
        { refreshLeaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        refreshLeaseId: leaseId,
        refreshLeaseExpiresAt: new Date(now.getTime() + REFRESH_LEASE_MS),
      },
    },
    { returnDocument: "after" },
  );
  if (leased) {
    return refreshCredential(leased, leaseId);
  }

  const current = await credentials.findOne({ _id: "primary" });
  if (!current || current.status === "reconnect_required") {
    throw new CodexReconnectRequiredError(
      current?.failureMessage ?? "Codex 授权已失效，请重新连接",
    );
  }
  if (current.accessTokenExpiresAt.getTime() <= Date.now()) {
    throw new CodexUpstreamError("Codex 登录令牌正在刷新，请稍后再试");
  }
  return {
    accessToken: decryptCodexAccessToken(current.accessTokenEncrypted),
    accountId: current.accountId,
    refreshVersion: current.refreshVersion,
  };
}

function parseUsageWindow(value: unknown): CodexUsageWindow | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    throw new CodexUpstreamError("Codex 返回的额度窗口格式不正确");
  }
  const usedPercent = value.used_percent;
  if (
    typeof usedPercent !== "number" ||
    !Number.isFinite(usedPercent) ||
    usedPercent < 0 ||
    usedPercent > 100
  ) {
    throw new CodexUpstreamError("Codex 返回的额度比例格式不正确");
  }

  const seconds = value.limit_window_seconds;
  if (
    seconds !== null &&
    seconds !== undefined &&
    (!Number.isSafeInteger(seconds) || (seconds as number) <= 0)
  ) {
    throw new CodexUpstreamError("Codex 返回的额度周期格式不正确");
  }
  const resetAt = value.reset_at;
  if (
    resetAt !== null &&
    resetAt !== undefined &&
    (!Number.isSafeInteger(resetAt) || (resetAt as number) <= 0)
  ) {
    throw new CodexUpstreamError("Codex 返回的额度重置时间格式不正确");
  }

  return {
    usedPercent,
    windowMinutes:
      typeof seconds === "number" ? seconds / 60 : null,
    resetsAt:
      typeof resetAt === "number"
        ? new Date(resetAt * 1_000).toISOString()
        : null,
  };
}

function parseCreditBalance(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
  ) {
    throw new CodexUpstreamError("Codex 返回的额外额度余额格式不正确");
  }
  return value;
}

function parseRateLimitStatus(value: unknown): {
  primaryWindow: CodexUsageWindow | null;
  secondaryWindow: CodexUsageWindow | null;
} | null {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    typeof value.allowed !== "boolean" ||
    typeof value.limit_reached !== "boolean"
  ) {
    throw new CodexUpstreamError("Codex 返回的额度状态格式不正确");
  }
  return {
    primaryWindow: parseUsageWindow(value.primary_window),
    secondaryWindow: parseUsageWindow(value.secondary_window),
  };
}

function parseAdditionalRateLimits(value: unknown): CodexAdditionalRateLimit[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new CodexUpstreamError("Codex 返回的额外额度列表格式不正确");
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new CodexUpstreamError("Codex 返回的额外额度项格式不正确");
    }
    const name = requiredString(item.limit_name, "limit_name", 200);
    const meteredFeature = requiredString(
      item.metered_feature,
      "metered_feature",
      200,
    );
    const rateLimit = parseRateLimitStatus(item.rate_limit);
    return {
      name,
      meteredFeature,
      primaryWindow: rateLimit?.primaryWindow ?? null,
      secondaryWindow: rateLimit?.secondaryWindow ?? null,
    };
  });
}

function requiredFinitePercent(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new CodexUpstreamError(`Codex 返回的 ${field} 格式不正确`);
  }
  return value;
}

function parseSpendControl(value: unknown): CodexSpendControl | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.reached !== "boolean") {
    throw new CodexUpstreamError("Codex 返回的用量上限格式不正确");
  }
  let individualLimit: CodexSpendControlLimit | null = null;
  if (value.individual_limit !== null && value.individual_limit !== undefined) {
    const limit = value.individual_limit;
    if (!isRecord(limit)) {
      throw new CodexUpstreamError("Codex 返回的个人用量上限格式不正确");
    }
    const resetAt = limit.reset_at;
    if (!Number.isSafeInteger(resetAt) || (resetAt as number) <= 0) {
      throw new CodexUpstreamError("Codex 返回的用量重置时间格式不正确");
    }
    individualLimit = {
      limit: requiredString(limit.limit, "spend_control.limit", 200),
      used: requiredString(limit.used, "spend_control.used", 200),
      remaining: requiredString(
        limit.remaining,
        "spend_control.remaining",
        200,
      ),
      usedPercent: requiredFinitePercent(
        limit.used_percent,
        "spend_control.used_percent",
      ),
      remainingPercent: requiredFinitePercent(
        limit.remaining_percent,
        "spend_control.remaining_percent",
      ),
      resetsAt: new Date((resetAt as number) * 1_000).toISOString(),
    };
  }
  return { reached: value.reached, individualLimit };
}

function parseResetCredits(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.available_count) ||
    (value.available_count as number) < 0
  ) {
    throw new CodexUpstreamError("Codex 返回的额度重置次数格式不正确");
  }
  return value.available_count as number;
}

function parseUsage(payload: Record<string, unknown>): CodexUsage {
  const plan = payload.plan_type;
  if (plan !== null && plan !== undefined && typeof plan !== "string") {
    throw new CodexUpstreamError("Codex 返回的套餐信息格式不正确");
  }
  const rateLimit = parseRateLimitStatus(payload.rate_limit);
  if (!rateLimit) {
    throw new CodexUpstreamError("Codex 返回的额度信息格式不正确");
  }

  let credits: CodexUsageCredits | null = null;
  if (payload.credits !== null && payload.credits !== undefined) {
    if (
      !isRecord(payload.credits) ||
      typeof payload.credits.has_credits !== "boolean" ||
      typeof payload.credits.unlimited !== "boolean" ||
      typeof payload.credits.overage_limit_reached !== "boolean"
    ) {
      throw new CodexUpstreamError("Codex 返回的额外额度格式不正确");
    }
    credits = {
      hasCredits: payload.credits.has_credits,
      balance: parseCreditBalance(payload.credits.balance),
      unlimited: payload.credits.unlimited,
      overageLimitReached: payload.credits.overage_limit_reached,
    };
  }

  const codeReviewRateLimit = parseRateLimitStatus(
    payload.code_review_rate_limit,
  );
  const spendControl = parseSpendControl(payload.spend_control);

  return {
    planName: typeof plan === "string" && plan ? plan : null,
    primaryWindow: rateLimit.primaryWindow,
    secondaryWindow: rateLimit.secondaryWindow,
    codeReviewWindow: codeReviewRateLimit?.primaryWindow ?? null,
    additionalRateLimits: parseAdditionalRateLimits(
      payload.additional_rate_limits,
    ),
    credits,
    resetCreditsAvailable: parseResetCredits(
      payload.rate_limit_reset_credits,
    ),
    spendControlReached: spendControl?.reached ?? null,
    spendControl,
    updatedAt: new Date().toISOString(),
  };
}

export async function getCodexUsage(): Promise<CodexUsage> {
  const credential = await getValidCodexAccessToken();
  const response = await upstreamFetch(
    USAGE_URL,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${credential.accessToken}`,
        "ChatGPT-Account-ID": credential.accountId,
        originator: CODEX_ORIGINATOR,
        version: CODEX_CLIENT_VERSION,
        "User-Agent": CODEX_USER_AGENT,
      },
    },
    " Codex 额度服务",
  );
  if (response.status === 401) {
    await response.body?.cancel();
    await markCodexAccountReconnectRequired(
      "upstream_unauthorized",
      credential.refreshVersion,
    );
    throw new CodexReconnectRequiredError();
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new CodexUpstreamError(
      `Codex 额度获取失败，上游返回 ${response.status}`,
      response.status,
    );
  }
  return parseUsage(await readJsonRecord(response, "Codex 额度服务"));
}

export async function getCodexOverview(): Promise<CodexOverview> {
  const account = await getCodexAccountStatus();
  if (account.state !== "connected") {
    return { account, quota: null };
  }
  try {
    const quota = await getCodexUsage();
    return { account: await getCodexAccountStatus(), quota };
  } catch (error) {
    if (error instanceof CodexReconnectRequiredError) {
      return { account: await getCodexAccountStatus(), quota: null };
    }
    throw error;
  }
}

export async function disconnectCodexAccount(): Promise<boolean> {
  const credentials = await getCodexCredentialCollection();
  const existing = await credentials.findOne({ _id: "primary" });
  if (!existing) return false;
  if (existing.status === "reconnect_required") {
    throw new CodexValidationError(
      "这项 Codex 授权已经失效，请使用本地清除",
    );
  }

  const now = new Date();
  const leaseId = randomUUID();
  const leased = await credentials.findOneAndUpdate(
    {
      _id: "primary",
      status: "connected",
      $or: [
        { refreshLeaseId: null },
        { refreshLeaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        refreshLeaseId: leaseId,
        refreshLeaseExpiresAt: new Date(now.getTime() + DISCONNECT_LEASE_MS),
      },
    },
    { returnDocument: "after" },
  );
  if (!leased) {
    throw new CodexUpstreamError("Codex 账户正在处理另一项操作，请稍后再试");
  }

  let revoked = false;
  try {
    await revokeCodexRefreshToken(
      decryptCodexRefreshToken(leased.refreshTokenEncrypted),
    );
    revoked = true;
  } finally {
    if (!revoked) await releaseLease(leaseId);
  }

  const deleted = await credentials.deleteOne({
    _id: "primary",
    refreshLeaseId: leaseId,
  });
  if (deleted.deletedCount !== 1) {
    throw new CodexUpstreamError("Codex 授权已撤销，但本地连接记录删除失败");
  }
  return true;
}

export async function clearInvalidCodexAccount(): Promise<boolean> {
  const credentials = await getCodexCredentialCollection();
  const result = await credentials.deleteOne({
    _id: "primary",
    status: "reconnect_required",
  });
  return result.deletedCount === 1;
}
