import Link from "next/link";

import { AdminNav } from "./admin-nav";
import { LogoutButton } from "./logout-button";

export function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="sidebar">
        <Link aria-label="返回总览" className="brand" href="/dashboard">
          <span aria-hidden="true" className="brand-mark">V</span>
          <span>
            <strong>Vectaix</strong>
            <small>私人中转控制台</small>
          </span>
        </Link>

        <AdminNav />

        <div className="sidebar-foot">
          <LogoutButton />
        </div>
      </aside>

      <main className="main-canvas" id="main-content" tabIndex={-1}>{children}</main>

      <div className="mobile-bar">
        <AdminNav />
      </div>
    </div>
  );
}
