"use client";

import { useEffect, useState } from "react";

import { CopyIcon } from "./icons";

export function CopyButton({ value, label = "复制", compact = false }: Readonly<{ value: string; label?: string; compact?: boolean }>) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 1800);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  const stateLabel =
    state === "copied" ? "已复制" : state === "failed" ? "复制失败" : label;

  return (
    <button aria-label={stateLabel} className={compact ? "button button-secondary button-icon" : "button button-secondary"} onClick={copy} type="button">
      <CopyIcon />
      {compact ? null : <span>{stateLabel}</span>}
    </button>
  );
}
