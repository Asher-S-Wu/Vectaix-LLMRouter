import { createHash, randomBytes } from "node:crypto";

import { ObjectId } from "mongodb";

import { getProxyKeyCollection, getUserCollection } from "@/server/db";
import type { ModelRestrictionMode } from "@/server/db/types";
import { decryptProxyKey, encryptProxyKey } from "@/server/keys/crypto";

const KEY_NAME_MAX_LENGTH = 80;
const RAW_KEY_PREFIX = "sk-";

export interface ProxyKeyItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
}

export interface CreatedProxyKey {
  key: string;
  item: ProxyKeyItem;
}

export interface ProxyKeyAuth {
  modelMode: ModelRestrictionMode;
  models: string[];
}

export type RevealProxyKeyResult =
  | { status: "revealed"; key: string }
  | { status: "missing" };

export class ProxyKeyValidationError extends Error {
  readonly code = "PROXY_KEY_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "ProxyKeyValidationError";
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim();

  if (!normalized) {
    throw new ProxyKeyValidationError("设备名称不能为空");
  }

  if (normalized.length > KEY_NAME_MAX_LENGTH) {
    throw new ProxyKeyValidationError(
      `设备名称不能超过 ${KEY_NAME_MAX_LENGTH} 个字符`,
    );
  }

  return normalized;
}

function parseId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new ProxyKeyValidationError("设备密钥编号无效");
  }

  return new ObjectId(id);
}

function parseUserId(userId: string): ObjectId {
  if (!ObjectId.isValid(userId)) {
    throw new ProxyKeyValidationError("用户编号无效");
  }

  return new ObjectId(userId);
}

function parseOwnerId(ownerId: string | null): ObjectId | null {
  if (ownerId === null) {
    return null;
  }

  return parseUserId(ownerId);
}

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

function toItem(document: {
  _id: ObjectId;
  name: string;
  prefix: string;
  createdAt: Date;
}): ProxyKeyItem {
  return {
    id: document._id.toHexString(),
    name: document.name,
    prefix: document.prefix,
    createdAt: document.createdAt.toISOString(),
  };
}

export async function listProxyKeys(
  ownerId: string | null,
): Promise<ProxyKeyItem[]> {
  const collection = await getProxyKeyCollection();
  const documents = await collection
    .find({ userId: parseOwnerId(ownerId) })
    .sort({ createdAt: -1 })
    .toArray();
  return documents.map(toItem);
}

export async function createProxyKey(
  ownerId: string | null,
  name: string,
): Promise<CreatedProxyKey> {
  const collection = await getProxyKeyCollection();
  const normalizedName = normalizeName(name);
  const key = `${RAW_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const now = new Date();
  const document = {
    _id: new ObjectId(),
    userId: parseOwnerId(ownerId),
    name: normalizedName,
    prefix: key.slice(0, 13),
    keyHash: hashKey(key),
    keyEncrypted: encryptProxyKey(key),
    createdAt: now,
  };

  await collection.insertOne(document);

  return { key, item: toItem(document) };
}

export async function renameProxyKey(
  ownerId: string | null,
  id: string,
  name: string,
): Promise<ProxyKeyItem | null> {
  const collection = await getProxyKeyCollection();
  const objectId = parseId(id);
  const normalizedName = normalizeName(name);
  const result = await collection.updateOne(
    { _id: objectId, userId: parseOwnerId(ownerId) },
    { $set: { name: normalizedName } },
  );

  if (result.matchedCount === 0) {
    return null;
  }

  const updated = await collection.findOne({ _id: objectId });
  return updated ? toItem(updated) : null;
}

export async function removeProxyKey(
  ownerId: string | null,
  id: string,
): Promise<boolean> {
  const collection = await getProxyKeyCollection();
  const result = await collection.deleteOne({
    _id: parseId(id),
    userId: parseOwnerId(ownerId),
  });
  return result.deletedCount === 1;
}

export async function revealProxyKey(
  ownerId: string | null,
  id: string,
): Promise<RevealProxyKeyResult> {
  const collection = await getProxyKeyCollection();
  const document = await collection.findOne(
    { _id: parseId(id), userId: parseOwnerId(ownerId) },
    { projection: { keyEncrypted: 1 } },
  );

  if (!document) {
    return { status: "missing" };
  }

  return { status: "revealed", key: decryptProxyKey(document.keyEncrypted!) };
}

export async function authenticateProxyKey(
  rawKey: string,
): Promise<ProxyKeyAuth | null> {
  const candidate = rawKey.trim();

  if (!candidate.startsWith(RAW_KEY_PREFIX) || candidate.length < 20) {
    return null;
  }

  const collection = await getProxyKeyCollection();
  const keyDocument = await collection.findOne(
    { keyHash: hashKey(candidate) },
    { projection: { userId: 1 } },
  );

  if (!keyDocument) {
    return null;
  }

  if (keyDocument.userId === null) {
    return { modelMode: "all", models: [] };
  }

  const users = await getUserCollection();
  const userDocument = await users.findOne(
    { _id: keyDocument.userId },
    { projection: { modelMode: 1, models: 1 } },
  );

  if (!userDocument) {
    return null;
  }

  return {
    modelMode: userDocument.modelMode,
    models: userDocument.models,
  };
}
