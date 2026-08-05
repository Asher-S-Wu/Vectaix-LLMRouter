import { ConsoleShell } from "@/components/console-shell";
import type { ConsoleNavItem } from "@/components/console-nav";
import { logoutAction } from "@/features/admin/actions";
import { requireAdminSession } from "@/server/auth/admin-session";

const navigation: ConsoleNavItem[] = [
  { href: "/dashboard", label: "总览", shortLabel: "总览", icon: "dashboard" },
  { href: "/keys", label: "我的密钥", shortLabel: "密钥", icon: "key" },
  { href: "/users", label: "用户管理", shortLabel: "用户", icon: "users" },
  { href: "/settings", label: "接入设置", shortLabel: "设置", icon: "settings" },
];

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAdminSession();
  return (
    <ConsoleShell
      brandLabel="管理控制台"
      homeHref="/dashboard"
      items={navigation}
      logoutAction={logoutAction}
    >
      {children}
    </ConsoleShell>
  );
}
