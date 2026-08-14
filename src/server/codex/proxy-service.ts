import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import {
  getValidCodexAccessToken,
  markCodexAccountReconnectRequired,
} from "@/server/codex/account-service";
import {
  fetchChatGptWithCloudflareCookies,
} from "@/server/codex/chatgpt-cloudflare-fetch";
import { authenticateCodexProxyKey } from "@/server/codex/key-service";
import { getConfig } from "@/server/config";

const CODEX_ORIGIN = "https://chatgpt.com";
const CODEX_BASE_PATH = "/backend-api/codex";
const CODEX_CLIENT_VERSION = "0.147.0";
const CODEX_ORIGINATOR = "vectaix_llmrouter";
const CODEX_USER_AGENT = "Vectaix-LLMRouter/1.0.0";
const CODEX_MODELS_CACHE_MS = 30_000;
const DEFAULT_CODEX_SERVICE_TIER = "fast";
const RESPONSES_LITE_HEADER = "x-openai-internal-codex-responses-lite";

const RESERVED_CLIENT_METADATA_FIELDS = new Set([
  "installation_id",
  "session_id",
  "thread_id",
  "turn_id",
  "window_id",
  "request_kind",
  "compaction",
  "code_mode_tool_names",
  "turn_started_at_unix_ms",
  "forked_from_thread_id",
  "parent_thread_id",
  "parent_turn_id",
  "subagent_kind",
  "thread_source",
  "sandbox",
  "workspaces",
  "x-codex-installation-id",
  "x-codex-window-id",
  "x-codex-turn-metadata",
  "x-codex-parent-thread-id",
  "x-openai-subagent",
]);

const RESPONSE_FIELDS = new Set([
  "model",
  "input",
  "instructions",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "reasoning",
  "stream",
  "store",
  "stream_options",
  "include",
  "service_tier",
  "prompt_cache_key",
  "text",
  "client_metadata",
]);

const STATEFUL_RESPONSE_FIELDS = new Set([
  "conversation",
  "previous_response_id",
  "prompt",
]);

const SERVER_REFERENCE_FIELDS = new Set([
  "file_id",
  "vector_store_ids",
  "container_id",
  "conversation_id",
  "prompt_id",
  "response_id",
]);

const SENSITIVE_ERROR_FIELDS = new Set([
  "accesstoken",
  "accountid",
  "authorization",
  "cookie",
  "email",
  "organizationid",
  "refreshtoken",
  "token",
  "userid",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Authorization",
    "X-Api-Key",
    "Content-Type",
    "Content-Encoding",
    "Accept",
    "Range",
    "If-None-Match",
    "If-Range",
    "If-Modified-Since",
    "Idempotency-Key",
    "Anthropic-Version",
    "Anthropic-Beta",
    "OpenAI-Beta",
    "X-OpenRouter-Title",
    "X-Stainless-Arch",
    "X-Stainless-Async",
    "X-Stainless-Helper-Method",
    "X-Stainless-Lang",
    "X-Stainless-Os",
    "X-Stainless-Package-Version",
    "X-Stainless-Retry-Count",
    "X-Stainless-Runtime",
    "X-Stainless-Runtime-Version",
    "X-Stainless-Timeout",
  ].join(", "),
  "Access-Control-Expose-Headers":
    "X-Request-Id, X-Generation-Id, Retry-After, Content-Range",
  "Access-Control-Max-Age": "86400",
} as const;

interface CodexCredentials {
  accessToken: string;
  accountId: string;
  refreshVersion: number;
}

interface CodexRequestContext {
  clientRequestId: string;
  installationId: string;
  sessionId: string;
  startedAt: number;
  threadId: string;
  turnId: string;
  turnMetadata: string;
  windowId: string;
}

interface CodexModelMetadata {
  defaultReasoningLevel: string | null;
  defaultReasoningSummary: string | null;
  serviceTiers: ReadonlySet<string>;
  slug: string;
  supportsParallelToolCalls: boolean;
  supportsReasoningSummary: boolean;
  useResponsesLite: boolean;
}

interface CodexModelCatalog {
  bySlug: ReadonlyMap<string, CodexModelMetadata>;
  catalogModels: readonly Record<string, unknown>[];
  listedModels: readonly CodexModelMetadata[];
}

interface CachedCodexModelCatalog {
  accountId: string;
  catalog: CodexModelCatalog;
  expiresAt: number;
}

interface LoadedCodexModelCatalog {
  catalog: CodexModelCatalog;
  upstream: Response | null;
}

interface ParsedCodexRequest {
  clientMetadata: Record<string, string>;
  downstreamStream: boolean;
  include: string[];
  input: unknown[];
  instructions: string;
  modelSlug: string;
  parallelToolCalls: boolean | undefined;
  promptCacheKey: string | undefined;
  reasoning: Record<string, unknown>;
  serviceTier: string | undefined;
  supportedFields: Record<string, unknown>;
  toolChoice: string;
  tools: unknown[];
}

interface TerminalResponse {
  response: Record<string, unknown>;
  type: "response.completed" | "response.failed" | "response.incomplete";
}

class InvalidUpstreamResponseError extends Error {}

class InvalidModelCatalogError extends Error {}

let cachedModelCatalog: CachedCodexModelCatalog | null = null;
let cachedInstallationId: string | null = null;

function formatUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function getCodexInstallationId(): string {
  if (cachedInstallationId) return cachedInstallationId;

  const bytes = createHmac("sha256", getConfig().sessionSecret)
    .update("vectaix-codex:installation-id:v1", "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  cachedInstallationId = formatUuid(bytes);
  return cachedInstallationId;
}

function createUuidV7(): string {
  const bytes = randomBytes(16);
  let unixMilliseconds = BigInt(Date.now());

  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(unixMilliseconds & 0xffn);
    unixMilliseconds >>= 8n;
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  return formatUuid(bytes);
}

function createCodexRequestContext(): CodexRequestContext {
  const requestId = createUuidV7();
  const installationId = getCodexInstallationId();
  const startedAt = Date.now();
  const turnId = createUuidV7();
  const windowId = `${requestId}:0`;
  const turnMetadata = JSON.stringify({
    installation_id: installationId,
    session_id: requestId,
    thread_id: requestId,
    turn_id: turnId,
    window_id: windowId,
    request_kind: "turn",
    turn_started_at_unix_ms: startedAt,
  });

  return {
    clientRequestId: requestId,
    installationId,
    sessionId: requestId,
    startedAt,
    threadId: requestId,
    turnId,
    turnMetadata,
    windowId,
  };
}

function logCodexProxyStage(
  context: CodexRequestContext,
  stage: string,
  status?: number,
  upstream?: Response,
): void {
  console.info(
    "[codex-proxy]",
    JSON.stringify({
      stage,
      status: status ?? null,
      durationMs: Date.now() - context.startedAt,
      requestId: context.clientRequestId,
      upstreamRequestId:
        upstream?.headers.get("x-request-id") ??
        upstream?.headers.get("x-oai-request-id") ??
        null,
      upstreamCfRay: upstream?.headers.get("cf-ray") ?? null,
      contentType: upstream?.headers.get("content-type") ?? null,
      contentEncoding: upstream?.headers.get("content-encoding") ?? null,
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function corsHeaders(base?: HeadersInit): Headers {
  const headers = new Headers(base);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return headers;
}

function proxyError(
  status: number,
  message: string,
  upstream?: Response,
): Response {
  const headers = corsHeaders({ "Cache-Control": "no-store" });
  if (upstream) copySafeUpstreamHeaders(upstream, headers);

  return Response.json(
    { error: { code: status, message } },
    {
      status,
      headers,
    },
  );
}

function extractBearerToken(request: Request): string | null {
  if (request.headers.has("x-api-key")) return null;

  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

async function authenticateRequest(request: Request): Promise<Response | true> {
  const token = extractBearerToken(request);
  if (!token) {
    return proxyError(401, "Invalid or missing Codex proxy API key");
  }

  try {
    if (!(await authenticateCodexProxyKey(token))) {
      return proxyError(401, "Invalid Codex proxy API key");
    }
  } catch {
    return proxyError(503, "Codex proxy authentication database is unavailable");
  }

  return true;
}

async function loadCredentials(): Promise<CodexCredentials | Response> {
  let credentials: CodexCredentials;
  try {
    credentials = await getValidCodexAccessToken();
  } catch {
    return proxyError(503, "Codex account is unavailable or must be reconnected");
  }

  if (!credentials.accessToken.trim() || !credentials.accountId.trim()) {
    return proxyError(503, "Codex account is unavailable or must be reconnected");
  }

  return credentials;
}

function upstreamHeaders(
  credentials: CodexCredentials,
  accept: "application/json" | "text/event-stream",
  context?: CodexRequestContext,
  useResponsesLite = false,
): Headers {
  const headers = new Headers({
    Accept: accept,
    "Accept-Encoding": "identity",
    Authorization: `Bearer ${credentials.accessToken}`,
    "ChatGPT-Account-ID": credentials.accountId,
    originator: CODEX_ORIGINATOR,
    version: CODEX_CLIENT_VERSION,
    "User-Agent": CODEX_USER_AGENT,
  });
  if (accept === "text/event-stream") {
    headers.set("Content-Type", "application/json");
  }
  if (context) {
    headers.set("session-id", context.sessionId);
    headers.set("thread-id", context.threadId);
    headers.set("x-client-request-id", context.clientRequestId);
    headers.set("x-codex-turn-metadata", context.turnMetadata);
    headers.set("x-codex-window-id", context.windowId);
  }
  if (useResponsesLite) {
    headers.set(RESPONSES_LITE_HEADER, "true");
  }
  return headers;
}

function copySafeUpstreamHeaders(upstream: Response, headers: Headers): void {
  const requestId =
    upstream.headers.get("x-request-id") ??
    upstream.headers.get("x-oai-request-id");
  if (requestId) headers.set("x-request-id", requestId);

  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) headers.set("retry-after", retryAfter);
}

async function markReconnectRequired(
  refreshVersion: number,
): Promise<Response | null> {
  try {
    await markCodexAccountReconnectRequired(
      "upstream_unauthorized",
      refreshVersion,
    );
    return null;
  } catch {
    return proxyError(503, "Codex account state could not be updated");
  }
}

function redactErrorString(value: string, secrets: readonly string[]): string {
  let redacted = value.replace(/\bBearer\s+[^\s"']+/gi, "Bearer [redacted]");
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

function sanitizeErrorPayload(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") return redactErrorString(value, secrets);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeErrorPayload(item, secrets));
  }
  if (!isRecord(value)) return value;

  const sanitized: Record<string, unknown> = {};
  for (const [name, child] of Object.entries(value)) {
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      SENSITIVE_ERROR_FIELDS.has(normalizedName) ||
      normalizedName.endsWith("accesstoken") ||
      normalizedName.endsWith("refreshtoken")
    ) {
      continue;
    }
    sanitized[name] = sanitizeErrorPayload(child, secrets);
  }
  return sanitized;
}

async function sanitizedUpstreamError(
  upstream: Response,
  credentials: CodexCredentials,
): Promise<Response> {
  if (upstream.status === 401) {
    await upstream.body?.cancel().catch(() => undefined);
    const markError = await markReconnectRequired(credentials.refreshVersion);
    if (markError) return markError;
    return proxyError(
      503,
      "Codex account authorization expired; reconnect is required",
      upstream,
    );
  }

  const status = upstream.status >= 400 && upstream.status <= 599
    ? upstream.status
    : 502;
  const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    await upstream.body?.cancel().catch(() => undefined);
    return proxyError(status, "Codex upstream request failed", upstream);
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return proxyError(status, "Codex upstream request failed", upstream);
  }

  const sanitized = sanitizeErrorPayload(payload, [
    credentials.accessToken,
    credentials.accountId,
  ]);
  if (!isRecord(sanitized)) {
    return proxyError(status, "Codex upstream request failed", upstream);
  }

  const headers = corsHeaders({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  copySafeUpstreamHeaders(upstream, headers);
  return new Response(JSON.stringify(sanitized), { status, headers });
}

function optionalCatalogString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new InvalidModelCatalogError(`Invalid Codex model field: ${field}`);
  }
  return value;
}

function parseCodexModelCatalog(payload: unknown): CodexModelCatalog {
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    throw new InvalidModelCatalogError("Invalid Codex model catalog");
  }

  const bySlug = new Map<string, CodexModelMetadata>();
  const catalogModels: Record<string, unknown>[] = [];
  const listedModels: CodexModelMetadata[] = [];

  for (const value of payload.models) {
    if (!isRecord(value)) continue;
    if (
      typeof value.slug !== "string" ||
      !value.slug.trim() ||
      value.visibility !== "list" ||
      value.supported_in_api !== true ||
      bySlug.has(value.slug)
    ) {
      continue;
    }

    if (typeof value.supports_parallel_tool_calls !== "boolean") {
      throw new InvalidModelCatalogError(
        `Invalid Codex model field: ${value.slug}.supports_parallel_tool_calls`,
      );
    }
    if (
      value.use_responses_lite !== undefined &&
      typeof value.use_responses_lite !== "boolean"
    ) {
      throw new InvalidModelCatalogError(
        `Invalid Codex model field: ${value.slug}.use_responses_lite`,
      );
    }
    if (
      value.supports_reasoning_summary_parameter !== undefined &&
      typeof value.supports_reasoning_summary_parameter !== "boolean"
    ) {
      throw new InvalidModelCatalogError(
        `Invalid Codex model field: ${value.slug}.supports_reasoning_summary_parameter`,
      );
    }

    const rawServiceTiers = value.service_tiers ?? [];
    if (!Array.isArray(rawServiceTiers)) {
      throw new InvalidModelCatalogError(
        `Invalid Codex model field: ${value.slug}.service_tiers`,
      );
    }
    const serviceTiers = new Set<string>();
    for (const rawTier of rawServiceTiers) {
      if (
        !isRecord(rawTier) ||
        typeof rawTier.id !== "string" ||
        !rawTier.id.trim()
      ) {
        throw new InvalidModelCatalogError(
          `Invalid Codex model field: ${value.slug}.service_tiers`,
        );
      }
      serviceTiers.add(rawTier.id);
    }

    const metadata: CodexModelMetadata = {
      defaultReasoningLevel: optionalCatalogString(
        value.default_reasoning_level,
        `${value.slug}.default_reasoning_level`,
      ),
      defaultReasoningSummary: optionalCatalogString(
        value.default_reasoning_summary,
        `${value.slug}.default_reasoning_summary`,
      ),
      serviceTiers,
      slug: value.slug,
      supportsParallelToolCalls: value.supports_parallel_tool_calls,
      supportsReasoningSummary:
        value.supports_reasoning_summary_parameter !== false,
      useResponsesLite: value.use_responses_lite === true,
    };
    bySlug.set(metadata.slug, metadata);
    catalogModels.push(value);
    listedModels.push(metadata);
  }

  return { bySlug, catalogModels, listedModels };
}

async function loadCodexModelCatalog(
  credentials: CodexCredentials,
  context: CodexRequestContext,
  signal: AbortSignal,
  forceRefresh: boolean,
): Promise<LoadedCodexModelCatalog | Response> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedModelCatalog?.accountId === credentials.accountId &&
    cachedModelCatalog.expiresAt > now
  ) {
    return { catalog: cachedModelCatalog.catalog, upstream: null };
  }
  cachedModelCatalog = null;

  const url = new URL(`${CODEX_BASE_PATH}/models`, CODEX_ORIGIN);
  url.searchParams.set("client_version", CODEX_CLIENT_VERSION);
  let upstream: Response;
  logCodexProxyStage(context, "models.metadata.fetch.started");
  try {
    upstream = await fetchChatGptWithCloudflareCookies(url, {
      method: "GET",
      headers: upstreamHeaders(credentials, "application/json"),
      cache: "no-store",
      redirect: "manual",
      signal,
    });
  } catch {
    logCodexProxyStage(
      context,
      "models.metadata.fetch.failed",
      signal.aborted ? 499 : 502,
    );
    return proxyError(
      signal.aborted ? 499 : 502,
      signal.aborted
        ? "Client closed the request"
        : "Unable to connect to Codex upstream",
    );
  }
  logCodexProxyStage(
    context,
    "models.metadata.fetch.headers",
    upstream.status,
    upstream,
  );

  if (!upstream.ok) {
    return sanitizedUpstreamError(upstream, credentials);
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    logCodexProxyStage(context, "models.metadata.read.failed", 502, upstream);
    return proxyError(502, "Invalid response from Codex upstream", upstream);
  }

  let catalog: CodexModelCatalog;
  try {
    catalog = parseCodexModelCatalog(payload);
  } catch {
    logCodexProxyStage(context, "models.metadata.invalid_upstream", 502, upstream);
    return proxyError(502, "Invalid response from Codex upstream", upstream);
  }

  cachedModelCatalog = {
    accountId: credentials.accountId,
    catalog,
    expiresAt: Date.now() + CODEX_MODELS_CACHE_MS,
  };
  return { catalog, upstream };
}

function containsServerObjectReference(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsServerObjectReference);
  }
  if (!isRecord(value)) return false;

  if (value.type === "item_reference") return true;

  for (const [name, child] of Object.entries(value)) {
    if (SERVER_REFERENCE_FIELDS.has(name)) return true;
    if (name === "container" && typeof child === "string" && child !== "auto") {
      return true;
    }
    if (containsServerObjectReference(child)) return true;
  }
  return false;
}

function containsToolServerObjectReference(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsToolServerObjectReference(item));
  }
  if (!isRecord(value)) return false;

  const functionTool = value.type === "function";

  for (const [name, child] of Object.entries(value)) {
    // Function parameters are caller-owned JSON Schema. Names such as "file_id"
    // in that schema are ordinary argument names, not hosted object references.
    if (functionTool && name === "parameters") continue;
    if (SERVER_REFERENCE_FIELDS.has(name)) return true;
    if (name === "container" && typeof child === "string" && child !== "auto") {
      return true;
    }
    if (containsToolServerObjectReference(child)) return true;
  }
  return false;
}

function parseCodexRequestBody(value: unknown): ParsedCodexRequest | Response {
  if (!isRecord(value)) {
    return proxyError(400, "Request body must be a JSON object");
  }

  for (const field of [...STATEFUL_RESPONSE_FIELDS, ...SERVER_REFERENCE_FIELDS]) {
    if (field in value) {
      return proxyError(400, `Unsupported request field: ${field}`);
    }
  }

  if (
    "container" in value &&
    typeof value.container === "string" &&
    value.container !== "auto"
  ) {
    return proxyError(400, "Server-side object references are not supported");
  }

  if (value.background === true) {
    return proxyError(400, "Background responses are not supported");
  }

  if (typeof value.model !== "string" || !value.model.trim()) {
    return proxyError(400, "Request body must include a model");
  }
  const modelSlug = value.model.trim();

  if (!("input" in value)) {
    return proxyError(400, "Request body must include input");
  }

  let input: unknown[];
  if (typeof value.input === "string") {
    if (!value.input) {
      return proxyError(400, "Request input must not be empty");
    }
    input = [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: value.input }],
      },
    ];
  } else if (Array.isArray(value.input) && value.input.length > 0) {
    input = value.input;
  } else {
    return proxyError(400, "Request input must be a non-empty string or array");
  }

  if (
    "instructions" in value &&
    typeof value.instructions !== "string"
  ) {
    return proxyError(400, "Request instructions must be a string");
  }

  if ("stream" in value && typeof value.stream !== "boolean") {
    return proxyError(400, "Request stream must be a boolean");
  }

  if ("store" in value && value.store !== false) {
    return proxyError(400, "Stored responses are not supported");
  }

  if ("tools" in value && !Array.isArray(value.tools)) {
    return proxyError(400, "Request tools must be an array");
  }
  const tools = Array.isArray(value.tools) ? value.tools : [];

  if (
    containsServerObjectReference(input) ||
    containsToolServerObjectReference(tools)
  ) {
    return proxyError(400, "Server-side object references are not supported");
  }

  if (
    "tool_choice" in value &&
    (typeof value.tool_choice !== "string" || !value.tool_choice)
  ) {
    return proxyError(400, "Request tool_choice must be a non-empty string");
  }

  if (
    "parallel_tool_calls" in value &&
    typeof value.parallel_tool_calls !== "boolean"
  ) {
    return proxyError(400, "Request parallel_tool_calls must be a boolean");
  }
  const parallelToolCalls = typeof value.parallel_tool_calls === "boolean"
    ? value.parallel_tool_calls
    : undefined;

  if ("reasoning" in value && !isRecord(value.reasoning)) {
    return proxyError(400, "Request reasoning must be an object");
  }
  const reasoning: Record<string, unknown> = isRecord(value.reasoning)
    ? { ...value.reasoning }
    : {};
  if (
    "effort" in reasoning &&
    reasoning.effort !== null &&
    (typeof reasoning.effort !== "string" || !reasoning.effort)
  ) {
    return proxyError(
      400,
      "Request reasoning.effort must be a non-empty string or null",
    );
  }
  if (
    "summary" in reasoning &&
    reasoning.summary !== null &&
    (typeof reasoning.summary !== "string" || !reasoning.summary)
  ) {
    return proxyError(
      400,
      "Request reasoning.summary must be a non-empty string or null",
    );
  }
  if (
    "context" in reasoning &&
    reasoning.context !== null &&
    (typeof reasoning.context !== "string" || !reasoning.context)
  ) {
    return proxyError(
      400,
      "Request reasoning.context must be a non-empty string or null",
    );
  }
  if (reasoning.effort === null) delete reasoning.effort;
  if (reasoning.context === null) delete reasoning.context;
  if (reasoning.summary === null || reasoning.summary === "none") {
    delete reasoning.summary;
  }
  if (reasoning.effort === "ultra") reasoning.effort = "max";

  let include: string[];
  if ("include" in value) {
    if (
      !Array.isArray(value.include) ||
      value.include.some((item) => typeof item !== "string" || !item)
    ) {
      return proxyError(400, "Request include must be an array of strings");
    }
    include = [...value.include];
  } else {
    include = [];
  }
  if (!include.includes("reasoning.encrypted_content")) {
    include.push("reasoning.encrypted_content");
  }

  if (
    "prompt_cache_key" in value &&
    (typeof value.prompt_cache_key !== "string" || !value.prompt_cache_key)
  ) {
    return proxyError(400, "Request prompt_cache_key must be a non-empty string");
  }
  const promptCacheKey = typeof value.prompt_cache_key === "string"
    ? value.prompt_cache_key
    : undefined;

  if ("client_metadata" in value && !isRecord(value.client_metadata)) {
    return proxyError(400, "Request client_metadata must be an object");
  }
  const clientMetadata: Record<string, string> = {};
  if (isRecord(value.client_metadata)) {
    for (const [field, fieldValue] of Object.entries(value.client_metadata)) {
      if (typeof fieldValue !== "string") {
        return proxyError(
          400,
          "Request client_metadata values must all be strings",
        );
      }
      if (!RESERVED_CLIENT_METADATA_FIELDS.has(field)) {
        clientMetadata[field] = fieldValue;
      }
    }
  }
  let serviceTier: string | undefined = DEFAULT_CODEX_SERVICE_TIER;
  if ("service_tier" in value) {
    if (typeof value.service_tier !== "string" || !value.service_tier) {
      return proxyError(400, "Request service_tier must be a non-empty string");
    }
    serviceTier = value.service_tier === "default"
      ? undefined
      : value.service_tier;
  }

  if (
    "stream_options" in value &&
    value.stream_options !== null &&
    !isRecord(value.stream_options)
  ) {
    return proxyError(400, "Request stream_options must be an object or null");
  }
  if (
    "text" in value &&
    value.text !== null &&
    !isRecord(value.text)
  ) {
    return proxyError(400, "Request text must be an object or null");
  }

  const supportedFields = Object.fromEntries(
    Object.entries(value).filter(([field]) => RESPONSE_FIELDS.has(field)),
  );

  return {
    clientMetadata,
    downstreamStream: value.stream === true,
    include,
    input,
    instructions: typeof value.instructions === "string"
      ? value.instructions
      : "",
    modelSlug,
    parallelToolCalls,
    promptCacheKey,
    reasoning,
    serviceTier,
    supportedFields,
    toolChoice: typeof value.tool_choice === "string"
      ? value.tool_choice
      : "auto",
    tools,
  };
}

function modelSupportsServiceTier(
  model: CodexModelMetadata,
  serviceTier: string,
): boolean {
  if (serviceTier === "fast" || serviceTier === "priority") {
    return (
      model.serviceTiers.has("fast") || model.serviceTiers.has("priority")
    );
  }
  return model.serviceTiers.has(serviceTier);
}

function normalizeRequestBody(
  parsed: ParsedCodexRequest,
  context: CodexRequestContext,
  model: CodexModelMetadata,
): { body: Record<string, unknown>; downstreamStream: boolean } | Response {
  if (parsed.modelSlug !== model.slug) {
    return proxyError(400, "Requested Codex model is not available");
  }
  if (
    parsed.parallelToolCalls === true &&
    !model.supportsParallelToolCalls &&
    !model.useResponsesLite
  ) {
    return proxyError(
      400,
      `Parallel tool calls are not supported by model ${model.slug}`,
    );
  }

  const reasoning = { ...parsed.reasoning };
  if (!model.supportsReasoningSummary && "summary" in reasoning) {
    return proxyError(
      400,
      `Reasoning summary is not supported by model ${model.slug}`,
    );
  }
  if (!("effort" in reasoning) && model.defaultReasoningLevel) {
    reasoning.effort = model.defaultReasoningLevel === "ultra"
      ? "max"
      : model.defaultReasoningLevel;
  }
  if (
    model.supportsReasoningSummary &&
    !("summary" in reasoning) &&
    model.defaultReasoningSummary &&
    model.defaultReasoningSummary !== "none"
  ) {
    reasoning.summary = model.defaultReasoningSummary;
  }
  if (model.useResponsesLite) reasoning.context = "all_turns";

  if (
    parsed.serviceTier &&
    !modelSupportsServiceTier(model, parsed.serviceTier)
  ) {
    return proxyError(
      400,
      `Service tier is not supported by model ${model.slug}`,
    );
  }

  const clientMetadata = {
    ...parsed.clientMetadata,
    "x-codex-installation-id": context.installationId,
    session_id: context.sessionId,
    thread_id: context.threadId,
    turn_id: context.turnId,
    "x-codex-turn-metadata": context.turnMetadata,
    "x-codex-window-id": context.windowId,
  };

  let upstreamInput: unknown[] = parsed.input;
  let instructions = parsed.instructions;
  let upstreamTools: unknown = parsed.tools;
  let parallelToolCalls =
    typeof parsed.parallelToolCalls === "boolean"
      ? parsed.parallelToolCalls
      : model.supportsParallelToolCalls;

  if (model.useResponsesLite) {
    const prefix: unknown[] = [
      { type: "additional_tools", role: "developer", tools: parsed.tools },
    ];
    if (instructions) {
      prefix.push({
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: instructions }],
      });
    }
    upstreamInput = [...prefix, ...parsed.input];
    instructions = "";
    upstreamTools = undefined;
    parallelToolCalls = false;
  }

  const body: Record<string, unknown> = {
    ...parsed.supportedFields,
    model: model.slug,
    input: upstreamInput,
    instructions,
    tools: upstreamTools,
    tool_choice: parsed.toolChoice,
    parallel_tool_calls: parallelToolCalls,
    reasoning,
    stream: true,
    store: false,
    include: parsed.include,
    prompt_cache_key: parsed.promptCacheKey ?? context.sessionId,
    client_metadata: clientMetadata,
  };
  if (upstreamTools === undefined) delete body.tools;
  if (parsed.serviceTier === undefined) delete body.service_tier;
  else body.service_tier = parsed.serviceTier;

  return {
    downstreamStream: parsed.downstreamStream,
    body,
  };
}

function attachClientAbort(request: Request): {
  controller: AbortController;
  detach: () => void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort(request.signal.reason);
  const detach = () => request.signal.removeEventListener("abort", abort);

  if (request.signal.aborted) abort();
  else request.signal.addEventListener("abort", abort, { once: true });

  return { controller, detach };
}

function passthroughBody(
  body: ReadableStream<Uint8Array>,
  abortController: AbortController,
  detachAbortListener: () => void,
  context: CodexRequestContext,
  upstream: Response,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let receivedFirstChunk = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          detachAbortListener();
          logCodexProxyStage(
            context,
            "responses.stream.completed",
            upstream.status,
            upstream,
          );
          controller.close();
          return;
        }
        if (!receivedFirstChunk) {
          receivedFirstChunk = true;
          logCodexProxyStage(
            context,
            "responses.stream.first_chunk",
            upstream.status,
            upstream,
          );
        }
        controller.enqueue(value);
      } catch (error) {
        detachAbortListener();
        logCodexProxyStage(
          context,
          "responses.stream.failed",
          abortController.signal.aborted ? 499 : 502,
          upstream,
        );
        abortController.abort(error);
        await reader.cancel(error).catch(() => undefined);
        controller.error(error);
      }
    },
    async cancel(reason) {
      detachAbortListener();
      logCodexProxyStage(
        context,
        "responses.stream.cancelled",
        499,
        upstream,
      );
      abortController.abort(reason);
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

function parseSseEvent(
  eventName: string,
  dataLines: string[],
  completedOutputItems: Map<number, Record<string, unknown>>,
): TerminalResponse | null {
  if (dataLines.length === 0) return null;

  const data = dataLines.join("\n");
  if (data === "[DONE]") {
    throw new InvalidUpstreamResponseError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    throw new InvalidUpstreamResponseError();
  }
  if (!isRecord(payload)) throw new InvalidUpstreamResponseError();

  const type = typeof payload.type === "string" ? payload.type : eventName;
  if (type === "error") throw new InvalidUpstreamResponseError();
  if (type === "response.output_item.done") {
    if (
      !Number.isSafeInteger(payload.output_index) ||
      (payload.output_index as number) < 0 ||
      !isRecord(payload.item)
    ) {
      throw new InvalidUpstreamResponseError();
    }
    completedOutputItems.set(payload.output_index as number, payload.item);
    return null;
  }
  if (
    type !== "response.completed" &&
    type !== "response.failed" &&
    type !== "response.incomplete"
  ) {
    return null;
  }

  if (!isRecord(payload.response)) {
    throw new InvalidUpstreamResponseError();
  }
  const response = { ...payload.response };
  if (
    completedOutputItems.size > 0 &&
    (!Array.isArray(response.output) || response.output.length === 0)
  ) {
    response.output = [...completedOutputItems.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, item]) => item);
  }
  return { type, response };
}

async function readTerminalResponse(
  body: ReadableStream<Uint8Array>,
): Promise<TerminalResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];
  const completedOutputItems = new Map<number, Record<string, unknown>>();

  const dispatch = (): TerminalResponse | null => {
    const terminal = parseSseEvent(
      eventName,
      dataLines,
      completedOutputItems,
    );
    eventName = "";
    dataLines = [];
    return terminal;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        let line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);

        if (!line) {
          const terminal = dispatch();
          if (terminal) {
            await reader.cancel().catch(() => undefined);
            return terminal;
          }
        } else if (!line.startsWith(":")) {
          const separator = line.indexOf(":");
          const field = separator === -1 ? line : line.slice(0, separator);
          let fieldValue = separator === -1 ? "" : line.slice(separator + 1);
          if (fieldValue.startsWith(" ")) fieldValue = fieldValue.slice(1);

          if (field === "event") eventName = fieldValue;
          else if (field === "data") dataLines.push(fieldValue);
        }

        newline = buffer.indexOf("\n");
      }

      if (done) {
        if (buffer) {
          let line = buffer;
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          } else if (line.startsWith("event:")) {
            eventName = line.slice(6).replace(/^ /, "");
          }
        }

        const terminal = dispatch();
        if (terminal) return terminal;
        throw new InvalidUpstreamResponseError();
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}

function streamingResponse(
  upstream: Response,
  abortController: AbortController,
  detachAbortListener: () => void,
  context: CodexRequestContext,
): Response {
  const headers = corsHeaders({
    "Cache-Control": "no-cache, no-transform",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
  });
  copySafeUpstreamHeaders(upstream, headers);

  return new Response(
    passthroughBody(
      upstream.body!,
      abortController,
      detachAbortListener,
      context,
      upstream,
    ),
    { status: upstream.status, headers },
  );
}

export function codexOptionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function handleCodexResponsesRequest(request: Request): Promise<Response> {
  const authentication = await authenticateRequest(request);
  if (authentication instanceof Response) return authentication;

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return proxyError(400, "Request body must be valid JSON");
  }
  const parsed = parseCodexRequestBody(value);
  if (parsed instanceof Response) return parsed;

  const credentials = await loadCredentials();
  if (credentials instanceof Response) return credentials;

  const context = createCodexRequestContext();
  const { controller, detach } = attachClientAbort(request);
  const loadedCatalog = await loadCodexModelCatalog(
    credentials,
    context,
    controller.signal,
    false,
  );
  if (loadedCatalog instanceof Response) {
    detach();
    return loadedCatalog;
  }
  const model = loadedCatalog.catalog.bySlug.get(parsed.modelSlug);
  if (!model) {
    detach();
    return proxyError(400, "Requested Codex model is not available");
  }

  const normalized = normalizeRequestBody(parsed, context, model);
  if (normalized instanceof Response) {
    detach();
    return normalized;
  }

  let upstream: Response;
  logCodexProxyStage(context, "responses.fetch.started");
  try {
    upstream = await fetchChatGptWithCloudflareCookies(
      new URL(`${CODEX_BASE_PATH}/responses`, CODEX_ORIGIN),
      {
        method: "POST",
        headers: upstreamHeaders(
          credentials,
          "text/event-stream",
          context,
          model.useResponsesLite,
        ),
        body: JSON.stringify(normalized.body),
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      },
    );
  } catch {
    detach();
    if (request.signal.aborted) {
      logCodexProxyStage(context, "responses.fetch.failed", 499);
      return proxyError(499, "Client closed the request");
    }
    logCodexProxyStage(context, "responses.fetch.failed", 502);
    return proxyError(502, "Unable to connect to Codex upstream");
  }
  logCodexProxyStage(
    context,
    "responses.fetch.headers",
    upstream.status,
    upstream,
  );

  if (!upstream.ok) {
    try {
      const response = await sanitizedUpstreamError(upstream, credentials);
      logCodexProxyStage(
        context,
        "responses.completed",
        response.status,
        upstream,
      );
      return response;
    } finally {
      detach();
    }
  }

  const contentType = upstream.headers.get("content-type")?.toLowerCase() ?? null;
  const hasInvalidContentType =
    contentType !== null && !contentType.includes("text/event-stream");
  if (!upstream.body || hasInvalidContentType) {
    detach();
    if (upstream.body) {
      await upstream.body.cancel().catch(() => undefined);
    }
    logCodexProxyStage(context, "responses.invalid_upstream", 502, upstream);
    return proxyError(502, "Invalid response from Codex upstream");
  }

  if (normalized.downstreamStream) {
    logCodexProxyStage(
      context,
      "responses.stream.opened",
      upstream.status,
      upstream,
    );
    return streamingResponse(upstream, controller, detach, context);
  }

  logCodexProxyStage(
    context,
    "responses.read.started",
    upstream.status,
    upstream,
  );
  try {
    const terminal = await readTerminalResponse(upstream.body);
    detach();
    const headers = corsHeaders({
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    });
    copySafeUpstreamHeaders(upstream, headers);
    logCodexProxyStage(context, "responses.completed", 200, upstream);
    return new Response(JSON.stringify(terminal.response), { status: 200, headers });
  } catch {
    detach();
    if (request.signal.aborted) {
      logCodexProxyStage(context, "responses.read.failed", 499, upstream);
      return proxyError(499, "Client closed the request");
    }
    logCodexProxyStage(context, "responses.read.failed", 502, upstream);
    return proxyError(502, "Invalid response from Codex upstream");
  }
}

export async function handleCodexModelsRequest(request: Request): Promise<Response> {
  const authentication = await authenticateRequest(request);
  if (authentication instanceof Response) return authentication;

  const credentials = await loadCredentials();
  if (credentials instanceof Response) return credentials;

  const context = createCodexRequestContext();
  const { controller, detach } = attachClientAbort(request);
  const loadedCatalog = await loadCodexModelCatalog(
    credentials,
    context,
    controller.signal,
    true,
  );
  detach();
  if (loadedCatalog instanceof Response) return loadedCatalog;
  if (!loadedCatalog.upstream) {
    return proxyError(502, "Invalid response from Codex upstream");
  }

  const upstream = loadedCatalog.upstream;
  const data = loadedCatalog.catalog.listedModels.map((model) => ({
    id: model.slug,
    object: "model",
    created: 0,
    owned_by: "openai",
  }));

  const headers = corsHeaders({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  });
  copySafeUpstreamHeaders(upstream, headers);
  logCodexProxyStage(context, "models.completed", 200, upstream);
  return new Response(
    JSON.stringify({
      object: "list",
      data,
      models: loadedCatalog.catalog.catalogModels,
    }),
    { status: 200, headers },
  );
}
