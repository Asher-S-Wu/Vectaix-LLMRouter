import Link from "next/link";

import { AdminNav } from "./admin-nav";
import { LogoutButton } from "./logout-button";

export function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="sidebar">
        <Link aria-label="返回 Vectaix 总览" className="brand" href="/dashboard">
          <span aria-hidden="true" className="brand-mark"><b>V</b><i /><i /></span>
          <span>
            <strong>Vectaix</strong>
            <small>PRIVATE AI RELAY · SIN</small>
          </span>
        </Link>

        <div className="node-badge">
          <span className="status-beacon" />
          <div>
            <small>出口节点</small>
            <strong>新加坡 · SIN</strong>
          </div>
          <span className="node-code">01°N</span>
        </div>

        <AdminNav />

        <div className="sidebar-foot">
          <p>VECTAIX PRIVATE RELAY</p>
          <p>OPENROUTER VIA SIN</p>
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
