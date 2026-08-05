import { ConsoleShell } from "@/components/console-shell";
import type { ConsoleNavItem } from "@/components/console-nav";
import { userLogoutAction } from "@/features/portal/actions";
import { getCurrentUser } from "@/server/portal/queries";

const navigation: ConsoleNavItem[] = [
  { href: "/portal/keys", label: "我的密钥", shortLabel: "密钥", icon: "key" },
  { href: "/portal/guide", label: "接入指南", shortLabel: "指南", icon: "book" },
];

export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <ConsoleShell
      brandLabel="用户中心"
      homeHref="/portal/keys"
      items={navigation}
      logoutAction={userLogoutAction}
      username={user.username}
    >
      {children}
    </ConsoleShell>
  );
}
