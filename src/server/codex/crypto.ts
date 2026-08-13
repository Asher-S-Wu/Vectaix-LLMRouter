import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { getConfig } from "@/server/config";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

type EncryptionPurpose =
  | "access-token"
  | "device-auth-id"
  | "device-user-code"
  | "proxy-key"
  | "refresh-token";

function encryptionKey(purpose: EncryptionPurpose): Buffer {
  return createHash("sha256")
    .update(
      `vectaix-codex-${purpose}-encryption:${getConfig().sessionSecret}`,
      "utf8",
    )
    .digest();
}

function associatedData(purpose: EncryptionPurpose): Buffer {
  return Buffer.from(`vectaix-codex:${purpose}`, "utf8");
}

function encrypt(value: string, purpose: EncryptionPurpose): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(purpose), iv);
  cipher.setAAD(associatedData(purpose));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decodePart(part: string): Buffer {
  if (!BASE64URL_PATTERN.test(part)) {
    throw new Error("Codex 密文格式不正确");
  }

  const decoded = Buffer.from(part, "base64url");
  if (decoded.toString("base64url") !== part) {
    throw new Error("Codex 密文格式不正确");
  }
  return decoded;
}

function decrypt(payload: string, purpose: EncryptionPurpose): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Codex 密文格式不正确");
  }

  const [iv, authTag, ciphertext] = parts.map(decodePart);
  if (
    iv.length !== IV_LENGTH ||
    authTag.length !== AUTH_TAG_LENGTH ||
    ciphertext.length === 0
  ) {
    throw new Error("Codex 密文格式不正确");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(purpose),
    iv,
  );
  decipher.setAAD(associatedData(purpose));
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptCodexProxyKey(value: string): string {
  return encrypt(value, "proxy-key");
}

export function decryptCodexProxyKey(payload: string): string {
  return decrypt(payload, "proxy-key");
}

export function encryptCodexAccessToken(value: string): string {
  return encrypt(value, "access-token");
}

export function decryptCodexAccessToken(payload: string): string {
  return decrypt(payload, "access-token");
}

export function encryptCodexRefreshToken(value: string): string {
  return encrypt(value, "refresh-token");
}

export function decryptCodexRefreshToken(payload: string): string {
  return decrypt(payload, "refresh-token");
}

export function encryptCodexDeviceAuthId(value: string): string {
  return encrypt(value, "device-auth-id");
}

export function decryptCodexDeviceAuthId(payload: string): string {
  return decrypt(payload, "device-auth-id");
}

export function encryptCodexDeviceUserCode(value: string): string {
  return encrypt(value, "device-user-code");
}

export function decryptCodexDeviceUserCode(payload: string): string {
  return decrypt(payload, "device-user-code");
}
