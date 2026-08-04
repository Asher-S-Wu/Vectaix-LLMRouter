import { redirect } from "next/navigation";

import {
  getAdminSession,
  type AdminSession,
} from "@/server/auth/session";

export { getAdminSession, type AdminSession };

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  return session;
}
