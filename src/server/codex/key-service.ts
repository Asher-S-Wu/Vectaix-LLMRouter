import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { ObjectId } from "mongodb";

import { getCodexProxyKeyCollection } from "@/server/db";
import {
  decryptCodexProxyKey,
  encryptCodexProxyKey,
} from "@/server/codex/crypto";

const KEY_NAME_MAX_LENGTH = 80;
const RAW_KEY_PREFIX = "sk-";
const RAW_KEY_RANDOM_LENGTH = 43;

export interface CodexProxyKeyItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
}

export interface CreatedCodexProxyKey {
  key: string;
  item: CodexProxyKeyItem;
}

export interface CodexProxyKeyAuth {
  keyId: string;
}

export type RevealCodexProxyKeyResult =
  | { status: "revealed"; key: string }
  | { status: "missing" };

export class CodexProxyKeyValidationError extends Error {
  readonly code = "CODEX_PROXY_KEY_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "CodexProxyKeyValidationError";
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new CodexProxyKeyValidationError("设备名称不能为空");
  }
  if (normalized.length > KEY_NAME_MAX_LENGTH) {
    throw new CodexProxyKeyValidationError(
      `设备名称不能超过 ${KEY_NAME_MAX_LENGTH} 个字符`,
    );
  }
  return normalized;
}

function parseId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new CodexProxyKeyValidationError("Codex 密钥编号无效");
  }
  return new ObjectId(id);
}

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

function isRawKey(candidate: string): boolean {
  const randomPart = candidate.slice(RAW_KEY_PREFIX.length);
  return (
    candidate.startsWith(RAW_KEY_PREFIX) &&
    randomPart.length === RAW_KEY_RANDOM_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(randomPart)
  );
}

function toItem(document: {
  _id: ObjectId;
  name: string;
  prefix: string;
  createdAt: Date;
}): CodexProxyKeyItem {
  return {
    id: document._id.toHexString(),
    name: document.name,
    prefix: document.prefix,
    createdAt: document.createdAt.toISOString(),
  };
}

export async function listCodexProxyKeys(): Promise<CodexProxyKeyItem[]> {
  const collection = await getCodexProxyKeyCollection();
  const documents = await collection.find().sort({ createdAt: -1 }).toArray();
  return documents.map(toItem);
}

export async function createCodexProxyKey(
  name: string,
): Promise<CreatedCodexProxyKey> {
  const collection = await getCodexProxyKeyCollection();
  const key = `${RAW_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const document = {
    _id: new ObjectId(),
    name: normalizeName(name),
    prefix: key.slice(0, 13),
    keyHash: hashKey(key),
    keyEncrypted: encryptCodexProxyKey(key),
    createdAt: new Date(),
  };
  await collection.insertOne(document);
  return { key, item: toItem(document) };
}

export async function renameCodexProxyKey(
  id: string,
  name: string,
): Promise<CodexProxyKeyItem | null> {
  const collection = await getCodexProxyKeyCollection();
  const objectId = parseId(id);
  const result = await collection.findOneAndUpdate(
    { _id: objectId },
    { $set: { name: normalizeName(name) } },
    { returnDocument: "after" },
  );
  return result ? toItem(result) : null;
}

export async function removeCodexProxyKey(id: string): Promise<boolean> {
  const collection = await getCodexProxyKeyCollection();
  const result = await collection.deleteOne({ _id: parseId(id) });
  return result.deletedCount === 1;
}

export async function revealCodexProxyKey(
  id: string,
): Promise<RevealCodexProxyKeyResult> {
  const collection = await getCodexProxyKeyCollection();
  const document = await collection.findOne(
    { _id: parseId(id) },
    { projection: { keyEncrypted: 1 } },
  );
  if (!document) {
    return { status: "missing" };
  }
  return {
    status: "revealed",
    key: decryptCodexProxyKey(document.keyEncrypted),
  };
}

export async function authenticateCodexProxyKey(
  rawKey: string,
): Promise<CodexProxyKeyAuth | null> {
  const candidate = rawKey.trim();
  if (!isRawKey(candidate)) {
    return null;
  }

  const collection = await getCodexProxyKeyCollection();
  const document = await collection.findOne(
    { keyHash: hashKey(candidate) },
    { projection: { _id: 1 } },
  );
  return document ? { keyId: document._id.toHexString() } : null;
}
