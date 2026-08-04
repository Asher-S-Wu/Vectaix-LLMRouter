"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DashboardIcon, KeyIcon, SettingsIcon } from "./icons";

const navigation = [
  { href: "/dashboard", label: "航线总览", shortLabel: "总览", icon: DashboardIcon },
  { href: "/keys", label: "设备密钥", shortLabel: "密钥", icon: KeyIcon },
  { href: "/settings", label: "接入设置", shortLabel: "设置", icon: SettingsIcon },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="控制台主导航" className="admin-nav">
      {navigation.map((item, index) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link aria-current={active ? "page" : undefined} className={active ? "nav-link is-active" : "nav-link"} href={item.href} key={item.href}>
            <span className="nav-index">0{index + 1}</span>
            <Icon />
            <span className="nav-label">{item.label}</span>
            <span className="nav-short-label">{item.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
