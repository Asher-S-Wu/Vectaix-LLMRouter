import "server-only";

import { requireAdminSession } from "@/server/auth/admin-session";
import { listProxyKeys } from "@/server/keys/service";
import { getSystemStatus, type SettingsStatus } from "@/server/status/service";

export async function getProxyKeys() {
  await requireAdminSession();
  return listProxyKeys();
}

export async function getSettingsStatus(): Promise<SettingsStatus> {
  await requireAdminSession();
  return getSystemStatus();
}

export type { SettingsStatus } from "@/server/status/service";
