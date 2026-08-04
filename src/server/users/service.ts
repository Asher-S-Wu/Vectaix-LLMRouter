import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { ObjectId } from "mongodb";

import {
  clearThrottle,
  getThrottleStatus,
  recordThrottleFailure,
} from "@/server/auth/throttle";
import { getProxyKeyCollection, getUserCollection } from "@/server/db";
import type { ModelRestrictionMode } from "@/server/db/types";

const USERNAME_MIN_LENGTH = 2;
const USERNAME_MAX_LENGTH = 24;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;
const MODEL_ID_MAX_LENGTH = 200;
const MODEL_LIST_MAX_LENGTH = 1_000;

const MODEL_RESTRICTION_MODES: readonly ModelRestrictionMode[] = [
  "all",
  "allow",
  "exclude",
];

const DUMMY_PASSWORD_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

export interface PortalUser {
  id: string;
  username: string;
  modelMode: ModelRestrictionMode;
  models: string[];
  createdAt: string;
}

export interface AdminUserItem extends PortalUser {
  keyCount: number;
}

export interface UserLoginCheck {
  ok: boolean;
  blocked: boolean;
  retryAfterSeconds: number | null;
  userId?: string;
}

export interface UserStats {
  userCount: number;
  keyCount: number;
}

export class UserValidationError extends Error {
  readonly code = "USER_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "UserValidationError";
  }
}

function normalizeUsername(username: string): string {
  const normalized = username.trim();

  if (
    normalized.length < USERNAME_MIN_LENGTH ||
    normalized.length > USERNAME_MAX_LENGTH
  ) {
    throw new UserValidationError(
      `用户名需要 ${USERNAME_MIN_LENGTH} 到 ${USERNAME_MAX_LENGTH} 个字符`,
    );
  }

  if (/\s/.test(normalized)) {
    throw new UserValidationError("用户名中不能包含空格");
  }

  return normalized;
}

function normalizePassword(password: string): string {
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new UserValidationError(
      `密码需要 ${PASSWORD_MIN_LENGTH} 到 ${PASSWORD_MAX_LENGTH} 个字符`,
    );
  }

  return password;
}

function parseUserId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new UserValidationError("用户编号无效");
  }

  return new ObjectId(id);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (salt.length !== 16 || expected.length !== 64) {
    return false;
  }

  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

function normalizeModelMode(mode: string): ModelRestrictionMode {
  if ((MODEL_RESTRICTION_MODES as readonly string[]).includes(mode)) {
    return mode as ModelRestrictionMode;
  }

  throw new UserValidationError("模型权限模式无效");
}

function normalizeModels(models: unknown): string[] {
  if (!Array.isArray(models)) {
    throw new UserValidationError("模型列表格式不正确");
  }

  if (models.length > MODEL_LIST_MAX_LENGTH) {
    throw new UserValidationError(
      `模型数量不能超过 ${MODEL_LIST_MAX_LENGTH} 个`,
    );
  }

  const normalized = new Set<string>();
  for (const item of models) {
    if (typeof item !== "string") {
      throw new UserValidationError("模型列表格式不正确");
    }

    const model = item.trim();
    if (!model) continue;

    if (model.length > MODEL_ID_MAX_LENGTH) {
      throw new UserValidationError(
        `模型 ID 不能超过 ${MODEL_ID_MAX_LENGTH} 个字符`,
      );
    }

    normalized.add(model);
  }

  return [...normalized].sort((a, b) => a.localeCompare(b));
}

function toPortalUser(document: {
  _id: ObjectId;
  username: string;
  modelMode: ModelRestrictionMode;
  models: string[];
  createdAt: Date;
}): PortalUser {
  return {
    id: document._id.toHexString(),
    username: document.username,
    modelMode: document.modelMode,
    models: document.models,
    createdAt: document.createdAt.toISOString(),
  };
}

export async function registerUser(
  username: string,
  password: string,
  sourceIp: string,
): Promise<PortalUser> {
  const scope = `register:${sourceIp}`;
  const throttle = await getThrottleStatus(scope);
  if (throttle.blocked) {
    const minutes = Math.max(
      1,
      Math.ceil((throttle.retryAfterSeconds ?? 60) / 60),
    );
    throw new UserValidationError(
      `尝试次数过多，请约 ${minutes} 分钟后再试`,
    );
  }

  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = normalizePassword(password);

  const users = await getUserCollection();
  const document = {
    _id: new ObjectId(),
    username: normalizedUsername,
    usernameKey: normalizedUsername.toLowerCase(),
    passwordHash: hashPassword(normalizedPassword),
    modelMode: "all" as const,
    models: [] as string[],
    createdAt: new Date(),
  };

  try {
    await users.insertOne(document);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new UserValidationError("这个用户名已被使用，换一个试试");
    }
    throw error;
  }

  await recordThrottleFailure(scope);
  return toPortalUser(document);
}

export async function verifyUserLogin(
  username: string,
  password: string,
  sourceIp: string,
): Promise<UserLoginCheck> {
  const normalized = username.trim().toLowerCase();
  const scope = `user-login:${normalized}@${sourceIp}`;

  const throttle = await getThrottleStatus(scope);
  if (throttle.blocked) {
    return { ok: false, ...throttle };
  }

  const users = await getUserCollection();
  const user = normalized
    ? await users.findOne({ usernameKey: normalized })
    : null;

  const passwordOk = verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordOk) {
    const failure = await recordThrottleFailure(scope);
    return { ok: false, ...failure };
  }

  await clearThrottle(scope);
  return {
    ok: true,
    blocked: false,
    retryAfterSeconds: null,
    userId: user._id.toHexString(),
  };
}

export async function findUserById(id: string): Promise<PortalUser | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const users = await getUserCollection();
  const document = await users.findOne({ _id: new ObjectId(id) });
  return document ? toPortalUser(document) : null;
}

export async function listUsers(): Promise<AdminUserItem[]> {
  const users = await getUserCollection();
  const documents = await users
    .aggregate<{
      _id: ObjectId;
      username: string;
      modelMode: ModelRestrictionMode;
      models: string[];
      createdAt: Date;
      keyCount: number;
    }>([
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "proxy_keys",
          localField: "_id",
          foreignField: "userId",
          as: "keys",
        },
      },
      {
        $project: {
          username: 1,
          modelMode: 1,
          models: 1,
          createdAt: 1,
          keyCount: { $size: "$keys" },
        },
      },
    ])
    .toArray();

  return documents.map((document) => ({
    ...toPortalUser(document),
    keyCount: document.keyCount,
  }));
}

export async function getUserStats(): Promise<UserStats> {
  const [users, keys] = await Promise.all([
    getUserCollection(),
    getProxyKeyCollection(),
  ]);
  const [userCount, keyCount] = await Promise.all([
    users.countDocuments(),
    keys.countDocuments(),
  ]);
  return { userCount, keyCount };
}

export async function updateUserModels(
  id: string,
  mode: string,
  models: unknown,
): Promise<AdminUserItem | null> {
  const users = await getUserCollection();
  const objectId = parseUserId(id);
  const modelMode = normalizeModelMode(mode);
  const normalizedModels = normalizeModels(models);

  if (modelMode !== "all" && normalizedModels.length === 0) {
    throw new UserValidationError("限制模型时，请至少选择一个模型");
  }

  const result = await users.updateOne(
    { _id: objectId },
    {
      $set: {
        modelMode,
        models: modelMode === "all" ? [] : normalizedModels,
      },
    },
  );

  if (result.matchedCount === 0) {
    return null;
  }

  const keys = await getProxyKeyCollection();
  const [updated, keyCount] = await Promise.all([
    users.findOne({ _id: objectId }),
    keys.countDocuments({ userId: objectId }),
  ]);

  return updated ? { ...toPortalUser(updated), keyCount } : null;
}

export async function removeUser(id: string): Promise<boolean> {
  const objectId = parseUserId(id);
  const users = await getUserCollection();
  const result = await users.deleteOne({ _id: objectId });

  if (result.deletedCount !== 1) {
    return false;
  }

  const keys = await getProxyKeyCollection();
  await keys.deleteMany({ userId: objectId });
  return true;
}
