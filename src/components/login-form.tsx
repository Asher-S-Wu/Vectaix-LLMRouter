"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState, useTransition } from "react";

import { loginAction } from "@/features/admin/actions";
import { userLoginAction } from "@/features/portal/actions";

type AuthTab = "user" | "admin";

function UserLoginForm() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);

    startTransition(async () => {
      const result = await userLoginAction(formData);
      if (result.ok) {
        router.replace("/portal/keys");
        router.refresh();
        return;
      }
      setMessage(result.message);
      passwordRef.current?.focus();
      passwordRef.current?.select();
    });
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor="login-username">用户名</label>
        <input
          autoComplete="username"
          autoFocus
          disabled={pending}
          id="login-username"
          name="username"
          placeholder="请输入用户名"
          required
        />
      </div>
      <div className="field-group">
        <label htmlFor="login-password">密码</label>
        <input
          autoComplete="current-password"
          disabled={pending}
          id="login-password"
          name="password"
          placeholder="请输入密码"
          ref={passwordRef}
          required
          type="password"
        />
      </div>
      {message ? <p className="form-message is-error" role="alert">{message}</p> : null}
      <button className="button button-primary login-submit" disabled={pending} type="submit">
        {pending ? "正在验证…" : "登录"}
      </button>
      <p className="auth-alt">还没有账户？<Link href="/register">注册一个</Link></p>
    </form>
  );
}

function AdminLoginForm() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);

    startTransition(async () => {
      const result = await loginAction(formData);
      if (result.ok) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      setMessage(result.message);
      passwordRef.current?.focus();
      passwordRef.current?.select();
    });
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor="admin-password">管理密码</label>
        <input
          autoComplete="current-password"
          disabled={pending}
          id="admin-password"
          name="password"
          placeholder="请输入管理密码"
          ref={passwordRef}
          required
          type="password"
        />
      </div>
      {message ? <p className="form-message is-error" role="alert">{message}</p> : null}
      <button className="button button-primary login-submit" disabled={pending} type="submit">
        {pending ? "正在验证…" : "进入管理控制台"}
      </button>
      <p className="auth-alt">管理密码在服务器的环境变量中设置，登录状态保存 30 天。</p>
    </form>
  );
}

export function AuthTabs() {
  const [tab, setTab] = useState<AuthTab>("user");

  return (
    <div className="auth-tabs-wrap">
      <div aria-label="选择登录身份" className="auth-tabs" role="tablist">
        <button
          aria-selected={tab === "user"}
          className={tab === "user" ? "auth-tab is-active" : "auth-tab"}
          onClick={() => setTab("user")}
          role="tab"
          type="button"
        >
          用户登录
        </button>
        <button
          aria-selected={tab === "admin"}
          className={tab === "admin" ? "auth-tab is-active" : "auth-tab"}
          onClick={() => setTab("admin")}
          role="tab"
          type="button"
        >
          管理员登录
        </button>
      </div>
      {tab === "user" ? <UserLoginForm /> : <AdminLoginForm />}
    </div>
  );
}
