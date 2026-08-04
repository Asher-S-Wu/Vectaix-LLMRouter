"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { LogoutIcon } from "./icons";

interface LogoutButtonProps {
  action: () => Promise<{ ok: boolean }>;
}

export function LogoutButton({ action }: Readonly<LogoutButtonProps>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function logout() {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        router.replace("/login");
        router.refresh();
      }
    });
  }

  return (
    <button className="nav-logout" disabled={pending} onClick={logout} type="button">
      <LogoutIcon />
      <span>{pending ? "正在退出…" : "退出登录"}</span>
    </button>
  );
}
