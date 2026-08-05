"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import { BookIcon, DashboardIcon, KeyIcon, SettingsIcon, UsersIcon } from "./icons";

export type ConsoleNavIcon = "book" | "dashboard" | "key" | "settings" | "users";

const ICON_COMPONENTS: Record<ConsoleNavIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  book: BookIcon,
  dashboard: DashboardIcon,
  key: KeyIcon,
  settings: SettingsIcon,
  users: UsersIcon,
};

export interface ConsoleNavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: ConsoleNavIcon;
}

export function ConsoleNav({ items }: Readonly<{ items: ConsoleNavItem[] }>) {
  const pathname = usePathname();

  return (
    <nav aria-label="控制台导航" className="admin-nav">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = ICON_COMPONENTS[item.icon];
        return (
          <Link aria-current={active ? "page" : undefined} className={active ? "nav-link is-active" : "nav-link"} href={item.href} key={item.href}>
            <Icon />
            <span className="nav-label">{item.label}</span>
            <span className="nav-short-label">{item.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
