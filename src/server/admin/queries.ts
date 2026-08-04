import "server-only";

import { requireAdminSession } from "@/server/auth/admin-session";
import { getSystemStatus, type SettingsStatus } from "@/server/status/service";
import {
  getUserStats,
  listUsers,
  type AdminUserItem,
  type UserStats,
} from "@/server/users/service";

export async function getUsers(): Promise<AdminUserItem[]> {
  await requireAdminSession();
  return listUsers();
}

export async function getDashboardStats(): Promise<UserStats> {
  await requireAdminSession();
  return getUserStats();
}

export async function getSettingsStatus(): Promise<SettingsStatus> {
  await requireAdminSession();
  return getSystemStatus();
}

export type { SettingsStatus } from "@/server/status/service";
