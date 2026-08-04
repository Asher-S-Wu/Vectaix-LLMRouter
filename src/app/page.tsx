import { redirect } from "next/navigation";

import { getAdminSession } from "@/server/auth/admin-session";

export default async function HomePage() {
  const session = await getAdminSession();
  redirect(session ? "/dashboard" : "/login");
}
