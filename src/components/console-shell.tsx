import Link from "next/link";

import { ConsoleNav, type ConsoleNavItem } from "./console-nav";
import { LogoutButton } from "./logout-button";
import { ThemeSwitch } from "./theme-switcher";

interface ConsoleShellProps {
  brandLabel: string;
  homeHref: string;
  items: ConsoleNavItem[];
  logoutAction: () => Promise<{ ok: boolean }>;
  username?: string;
  children: React.ReactNode;
}

export function ConsoleShell({
  brandLabel,
  homeHref,
  items,
  logoutAction,
  username,
  children,
}: Readonly<ConsoleShellProps>) {
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="sidebar">
        <Link aria-label="返回首页" className="brand" href={homeHref}>
          <span aria-hidden="true" className="brand-mark">V</span>
          <span>
            <strong>Vectaix</strong>
            <small>{brandLabel}</small>
          </span>
        </Link>

        <ConsoleNav items={items} />

        <div className="sidebar-foot">
          <ThemeSwitch />
          {username ? (
            <div className="sidebar-user" title={`当前登录：${username}`}>
              <span aria-hidden="true" className="user-avatar">{username.slice(0, 1).toUpperCase()}</span>
              <span className="user-name">{username}</span>
            </div>
          ) : null}
          <LogoutButton action={logoutAction} />
        </div>
      </aside>

      <main className="main-canvas" id="main-content" tabIndex={-1}>
        <div className="theme-bar-mobile">
          <ThemeSwitch />
        </div>
        {children}
      </main>

      <div className="mobile-bar">
        <ConsoleNav items={items} />
      </div>
    </div>
  );
}
