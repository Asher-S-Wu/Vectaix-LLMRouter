import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/register-form";
import { ThemeToggle } from "@/components/theme-switcher";
import { getAdminSession, getUserSession } from "@/server/auth";

export const metadata: Metadata = { title: "注册" };

export default async function RegisterPage() {
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
          <h1>创建账户</h1>
          <p>注册后即可创建设备密钥。</p>
          <RegisterForm />
        </section>
        <Link className="login-back" href="/login">已有账户？直接登录</Link>
      </div>
    </main>
  );
}
