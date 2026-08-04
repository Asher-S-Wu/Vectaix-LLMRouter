import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getConfig } from "@/server/config";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptionKey(): Buffer {
  return createHash("sha256")
    .update(`vectaix-proxy-key-encryption:${getConfig().sessionSecret}`, "utf8")
    .digest();
}

export function encryptProxyKey(rawKey: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(rawKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptProxyKey(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("密钥密文格式不正确");
  }

  const [iv, authTag, ciphertext] = parts.map((part) =>
    Buffer.from(part, "base64url"),
  );

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("密钥密文格式不正确");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}
