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
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white",
        active && "bg-white/15 text-white",
        collapsed && "justify-center px-2",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className={cn(collapsed && "sr-only")}>{item.label}</span>
    </Link>
  );
}
