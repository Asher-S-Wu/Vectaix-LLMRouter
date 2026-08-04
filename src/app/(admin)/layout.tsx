import { AdminShell } from "@/components/admin-shell";
import { requireAdminSession } from "@/server/auth/admin-session";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAdminSession();
  return <AdminShell>{children}</AdminShell>;
}
