"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState, useTransition } from "react";

import { loginAction } from "@/features/admin/actions";

export function LoginForm() {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
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
          autoFocus
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
        {pending ? "正在验证…" : "登录"}
      </button>
    </form>
  );
}
