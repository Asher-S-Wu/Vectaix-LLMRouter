import { createHash, randomBytes } from "node:crypto";

import { ObjectId } from "mongodb";

import { getProxyKeyCollection } from "@/server/db";

const KEY_NAME_MAX_LENGTH = 80;
const RAW_KEY_PREFIX = "orpx_";

export interface ProxyKeyItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreatedProxyKey {
  key: string;
  item: ProxyKeyItem;
}

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

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

function toItem(document: {
  _id: ObjectId;
  name: string;
  prefix: string;
  createdAt: Date;
  revokedAt: Date | null;
}): ProxyKeyItem {
  return {
    id: document._id.toHexString(),
    name: document.name,
    prefix: document.prefix,
    createdAt: document.createdAt.toISOString(),
    revokedAt: document.revokedAt?.toISOString() ?? null,
  };
}

export async function listProxyKeys(): Promise<ProxyKeyItem[]> {
  const collection = await getProxyKeyCollection();
  const documents = await collection.find({}).sort({ createdAt: -1 }).toArray();
  return documents.map(toItem);
}

export async function createProxyKey(name: string): Promise<CreatedProxyKey> {
  const collection = await getProxyKeyCollection();
  const normalizedName = normalizeName(name);
  const key = `${RAW_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const now = new Date();
  const document = {
    _id: new ObjectId(),
    name: normalizedName,
    prefix: key.slice(0, 13),
    keyHash: hashKey(key),
    createdAt: now,
    revokedAt: null,
  };

  await collection.insertOne(document);

  return { key, item: toItem(document) };
}

export async function renameProxyKey(
  id: string,
  name: string,
): Promise<ProxyKeyItem | null> {
  const collection = await getProxyKeyCollection();
  const objectId = parseId(id);
  const normalizedName = normalizeName(name);
  const result = await collection.updateOne(
    { _id: objectId },
    { $set: { name: normalizedName } },
  );

  if (result.matchedCount === 0) {
    return null;
  }

  const updated = await collection.findOne({ _id: objectId });
  return updated ? toItem(updated) : null;
}

export async function revokeProxyKey(id: string): Promise<boolean> {
  const collection = await getProxyKeyCollection();
  const result = await collection.updateOne(
    { _id: parseId(id), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return result.modifiedCount === 1;
}

export async function authenticateProxyKey(
  rawKey: string,
): Promise<boolean> {
  const candidate = rawKey.trim();

  if (!candidate.startsWith(RAW_KEY_PREFIX) || candidate.length < 20) {
    return false;
  }

  const collection = await getProxyKeyCollection();
  const document = await collection.findOne({
    keyHash: hashKey(candidate),
    revokedAt: null,
  }, { projection: { _id: 1 } });

  return document !== null;
}
