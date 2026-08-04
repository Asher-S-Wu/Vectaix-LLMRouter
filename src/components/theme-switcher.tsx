"use client";

import { useEffect, useState } from "react";

import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "vectaix-theme";

const OPTIONS = [
  { value: "system", label: "跟随系统", shortLabel: "系统", icon: MonitorIcon },
  { value: "light", label: "浅色模式", shortLabel: "浅色", icon: SunIcon },
  { value: "dark", label: "深色模式", shortLabel: "深色", icon: MoonIcon },
] as const;

function readStoredChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // 存储不可用时按跟随系统处理
  }
  return "system";
}

function applyChoice(choice: ThemeChoice) {
  const dark =
    choice === "dark" ||
    (choice === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function storeChoice(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // 存储不可用时仅本次会话生效
  }
}

function useThemeChoice() {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    setChoice(readStoredChoice());
  }, []);

  useEffect(() => {
    if (choice === null) return;

    storeChoice(choice);
    applyChoice(choice);

    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyChoice("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  return [choice, setChoice] as const;
}

export function ThemeSwitch() {
  const [choice, setChoice] = useThemeChoice();

  if (choice === null) {
    return <div aria-hidden="true" className="theme-switch theme-switch-skeleton" />;
  }

  return (
    <div aria-label="主题模式" className="theme-switch" role="radiogroup">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = choice === option.value;
        return (
          <button
            aria-checked={active}
            className={active ? "is-active" : undefined}
            key={option.value}
            onClick={() => setChoice(option.value)}
            role="radio"
            title={option.label}
            type="button"
          >
            <Icon />
            <span>{option.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ThemeToggle() {
  const [choice, setChoice] = useThemeChoice();

  if (choice === null) {
    return <div aria-hidden="true" className="theme-toggle-skeleton" />;
  }

  const index = OPTIONS.findIndex((option) => option.value === choice);
  const current = OPTIONS[index];
  const next = OPTIONS[(index + 1) % OPTIONS.length];
  const Icon = current.icon;

  return (
    <button
      aria-label={`当前主题：${current.label}，点击切换为${next.label}`}
      className="theme-toggle"
      onClick={() => setChoice(next.value)}
      title={`当前：${current.label}，点击切换为${next.label}`}
      type="button"
    >
      <Icon />
    </button>
  );
}
