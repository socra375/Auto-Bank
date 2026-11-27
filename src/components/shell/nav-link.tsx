"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

export function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed?: boolean; onNavigate?: () => void }) {
  const active = usePathname().startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[var(--sidebar-fg)] transition-colors hover:bg-white/10 hover:text-white",
        active && "bg-white/15 text-white before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-white",
        collapsed && "justify-center px-2",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className={cn(collapsed && "sr-only")}>{item.label}</span>
    </Link>
  );
}
