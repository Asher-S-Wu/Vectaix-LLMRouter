import { createHmac } from "node:crypto";

import { getConfig } from "@/server/config";
import { getLoginAttemptCollection } from "@/server/db";

const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export interface ThrottleStatus {
  blocked: boolean;
  retryAfterSeconds: number | null;
}

function scopeDigest(scope: string): string {
  return createHmac("sha256", getConfig().sessionSecret)
    .update(scope.trim().slice(0, 256) || "unknown")
    .digest("hex");
}

function retrySeconds(expiresAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
}

export async function getThrottleStatus(
  scope: string,
): Promise<ThrottleStatus> {
  const attempts = await getLoginAttemptCollection();
  const digest = scopeDigest(scope);
  const now = new Date();
  const current = await attempts.findOne({ _id: digest });

  if (!current) {
    return { blocked: false, retryAfterSeconds: null };
  }

  if (current.expiresAt <= now) {
    await attempts.deleteOne({ _id: digest });
    return { blocked: false, retryAfterSeconds: null };
  }

  if (current.failures >= MAX_FAILURES) {
    return {
      blocked: true,
      retryAfterSeconds: retrySeconds(current.expiresAt, now),
    };
  }

  return { blocked: false, retryAfterSeconds: null };
}

export async function recordThrottleFailure(
  scope: string,
): Promise<ThrottleStatus> {
  const attempts = await getLoginAttemptCollection();
  const digest = scopeDigest(scope);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + THROTTLE_WINDOW_MS);

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
    blocked,
    retryAfterSeconds:
      blocked && updated ? retrySeconds(updated.expiresAt, now) : null,
  };
}

export async function clearThrottle(scope: string): Promise<void> {
  const attempts = await getLoginAttemptCollection();
  await attempts.deleteOne({ _id: scopeDigest(scope) });
}
