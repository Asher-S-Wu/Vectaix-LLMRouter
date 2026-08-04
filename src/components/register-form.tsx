"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { registerAction } from "@/features/portal/actions";

export function RegisterForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(null);

    startTransition(async () => {
      const result = await registerAction(formData);
      if (result.ok) {
        router.replace("/portal/keys");
        router.refresh();
        return;
      }
      setMessage(result.message);
    });
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor="register-username">用户名</label>
        <input
          autoComplete="username"
          autoFocus
          disabled={pending}
          id="register-username"
          maxLength={24}
          name="username"
          placeholder="2-24 个字符，不能有空格"
          required
        />
      </div>
      <div className="field-group">
        <label htmlFor="register-password">密码</label>
        <input
          autoComplete="new-password"
          disabled={pending}
          id="register-password"
          maxLength={72}
          minLength={8}
          name="password"
          placeholder="至少 8 个字符"
          required
          type="password"
        />
      </div>
      <div className="field-group">
        <label htmlFor="register-confirm">确认密码</label>
        <input
          autoComplete="new-password"
          disabled={pending}
          id="register-confirm"
          maxLength={72}
          minLength={8}
          name="confirm"
          placeholder="再输入一遍密码"
          required
          type="password"
        />
      </div>
      {message ? <p className="form-message is-error" role="alert">{message}</p> : null}
      <button className="button button-primary login-submit" disabled={pending} type="submit">
        {pending ? "正在创建…" : "创建账户"}
      </button>
    </form>
  );
}
