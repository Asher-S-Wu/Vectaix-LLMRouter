import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getConfig } from "@/server/config";
import { getLoginAttemptCollection } from "@/server/db";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export interface AdminLoginCheck {
  ok: boolean;
  blocked: boolean;
  retryAfterSeconds: number | null;
}

function sourceDigest(sourceIp: string): string {
  const normalized = sourceIp.trim().slice(0, 256) || "unknown";

  return createHmac("sha256", getConfig().sessionSecret)
    .update(normalized)
    .digest("hex");
}

function passwordsMatch(supplied: string, expected: string): boolean {
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

function retrySeconds(expiresAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
}

export async function verifyAdminLogin(
  password: string,
  sourceIp: string,
): Promise<AdminLoginCheck> {
  const attempts = await getLoginAttemptCollection();
  const digest = sourceDigest(sourceIp);
  const now = new Date();
  let current = await attempts.findOne({ _id: digest });

  if (current && current.expiresAt <= now) {
    await attempts.deleteOne({ _id: digest });
    current = null;
  }

  if (current && current.failures >= MAX_FAILURES) {
    return {
      ok: false,
      blocked: true,
      retryAfterSeconds: retrySeconds(current.expiresAt, now),
    };
  }

  if (passwordsMatch(password, getConfig().adminPassword)) {
    await attempts.deleteOne({ _id: digest });
    return { ok: true, blocked: false, retryAfterSeconds: null };
  }

  const expiresAt = new Date(now.getTime() + LOGIN_WINDOW_MS);
  await attempts.updateOne(
    { _id: digest },
    {
      $inc: { failures: 1 },
      $set: { updatedAt: now },
      $setOnInsert: { firstAttemptAt: now, expiresAt },
    },
    { upsert: true },
  );

  const updated = await attempts.findOne({ _id: digest });
  const blocked = (updated?.failures ?? 1) >= MAX_FAILURES;

  return {
    ok: false,
    blocked,
    retryAfterSeconds:
      blocked && updated ? retrySeconds(updated.expiresAt, now) : null,
  };
}

