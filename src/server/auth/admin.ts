import { createHash, timingSafeEqual } from "node:crypto";

import { getConfig } from "@/server/config";
import {
  clearThrottle,
  getThrottleStatus,
  recordThrottleFailure,
} from "@/server/auth/throttle";

export interface AdminLoginCheck {
  ok: boolean;
  blocked: boolean;
  retryAfterSeconds: number | null;
}

function passwordsMatch(supplied: string, expected: string): boolean {
  const suppliedHash = createHash("sha256").update(supplied).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

export async function verifyAdminLogin(
  password: string,
  sourceIp: string,
): Promise<AdminLoginCheck> {
  const scope = `admin-login:${sourceIp}`;

  const throttle = await getThrottleStatus(scope);
  if (throttle.blocked) {
    return { ok: false, ...throttle };
  }

  if (passwordsMatch(password, getConfig().adminPassword)) {
    await clearThrottle(scope);
    return { ok: true, blocked: false, retryAfterSeconds: null };
  }

  const failure = await recordThrottleFailure(scope);
  return { ok: false, ...failure };
}
