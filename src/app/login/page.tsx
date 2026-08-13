import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthTabs } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-switcher";
import { getAdminSession, getUserSession } from "@/server/auth";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage() {
  const [adminSession, userSession] = await Promise.all([
    getAdminSession(),
    getUserSession(),
  ]);
  if (adminSession) redirect("/dashboard");
  if (userSession) redirect("/portal/keys");

  return (
    <main className="login-view">
      <div className="theme-fab">
        <ThemeToggle />
      </div>
      <div>
        <section className="login-card surface">
          <span aria-hidden="true" className="brand-mark brand-mark-large">V</span>
          <h1>登录 Vectaix</h1>
          <p>选择用户或管理员身份登录。</p>
          <AuthTabs />
        </section>
        <Link className="login-back" href="/">返回首页</Link>
      </div>
    </main>
  );
}
