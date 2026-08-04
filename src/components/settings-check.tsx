"use client";

import { useState, useTransition } from "react";

import { checkOpenRouterAction } from "@/features/admin/actions";

type CheckResult = Awaited<ReturnType<typeof checkOpenRouterAction>>;

export function SettingsCheck() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CheckResult | null>(null);

  function check() {
    setResult(null);
    startTransition(async () => {
      setResult(await checkOpenRouterAction());
    });
  }

  return (
    <div className="connection-check">
      <button className="button button-secondary" disabled={pending} onClick={check} type="button">
        {pending ? "正在连接…" : "测试与 OpenRouter 的连接"}
      </button>
      {result ? (
        <p className={`check-result ${result.ok ? "is-success" : "is-error"}`} role="status">
          <i />
          <span><strong>{result.message}</strong>{result.data ? <small>往返 {result.data.latencyMs} ms</small> : null}</span>
        </p>
      ) : null}
    </div>
  );
}
