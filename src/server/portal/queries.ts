import "server-only";

import { redirect } from "next/navigation";

import { clearUserSession, getUserSession } from "@/server/auth/session";
import { findUserById, type PortalUser } from "@/server/users/service";

export async function getCurrentUser(): Promise<PortalUser> {
  const session = await getUserSession();
  if (!session) redirect("/login");

  const user = await findUserById(session.userId);
  if (!user) {
    await clearUserSession();
    redirect("/login");
  }

  return user;
}
