import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getAdminSession } from "@/server/auth/admin-session";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/dashboard");

  return (
    <main className="login-view">
      <div>
        <section className="login-card surface">
          <span aria-hidden="true" className="brand-mark brand-mark-large">V</span>
          <h1>登录控制台</h1>
          <p>输入管理密码以继续。密码在服务器的环境变量中设置。</p>
          <LoginForm />
          <p className="login-note">登录状态会在这台设备上保存 12 小时，过期后需要重新输入密码。</p>
        </section>
        <Link className="login-back" href="/">返回首页</Link>
      </div>
    </main>
  );
}
