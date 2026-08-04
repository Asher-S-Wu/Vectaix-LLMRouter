"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

export interface ConsoleNavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export function ConsoleNav({ items }: Readonly<{ items: ConsoleNavItem[] }>) {
  const pathname = usePathname();

  return (
    <nav aria-label="控制台导航" className="admin-nav">
      {items.map((item) => {
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
