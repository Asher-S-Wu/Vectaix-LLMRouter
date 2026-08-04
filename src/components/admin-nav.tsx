"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DashboardIcon, KeyIcon, SettingsIcon } from "./icons";

const navigation = [
  { href: "/dashboard", label: "总览", shortLabel: "总览", icon: DashboardIcon },
  { href: "/keys", label: "设备密钥", shortLabel: "密钥", icon: KeyIcon },
  { href: "/settings", label: "接入设置", shortLabel: "设置", icon: SettingsIcon },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="控制台导航" className="admin-nav">
      {navigation.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
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
