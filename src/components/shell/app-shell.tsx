"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_ITEMS, MOBILE_PRIMARY } from "./nav";
import { NavList } from "./nav-list";
import { EddieButton } from "./eddie";

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/overview" className="flex items-center gap-2 px-3 py-4 text-lg font-bold text-white">
      <span aria-hidden className="grid size-8 place-items-center rounded-md bg-primary text-sm">AB</span>
      <span className={cn(collapsed && "sr-only")}>Auto-Bank</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const primary = ALL_ITEMS.filter((i) => MOBILE_PRIMARY.includes(i.href));

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        Saltar al contenido
      </a>

      <aside
        aria-label="Barra lateral"
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col bg-navy transition-[width] md:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <Brand collapsed={collapsed} />
        <nav aria-label="Principal" className="flex-1 overflow-y-auto px-2 pb-4">
          <NavList collapsed={collapsed} />
        </nav>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
          className="m-2 flex items-center justify-center rounded-md p-2 text-white/75 hover:bg-white/10 hover:text-white"
        >
          {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
        </button>
      </aside>

      <div className={cn("transition-[padding]", collapsed ? "md:pl-16" : "md:pl-64")}>
        <main id="contenido" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-10">
          {children}
        </main>
      </div>

      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/10 bg-navy md:hidden"
      >
        {primary.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 text-[11px] text-white/70",
                active && "text-white",
              )}
            >
              <Icon className="size-5" aria-hidden />
              <span className="truncate">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
        <Dialog.Root open={drawer} onOpenChange={setDrawer}>
          <Dialog.Trigger className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2 text-[11px] text-white/70">
            <Menu className="size-5" aria-hidden />
            <span>Más</span>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <Dialog.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-navy p-2"
            >
              <div className="flex items-center justify-between">
                <Dialog.Title className="px-3 py-3 text-lg font-bold text-white">Auto-Bank</Dialog.Title>
                <Dialog.Close aria-label="Cerrar menú" className="rounded-md p-2 text-white/75 hover:bg-white/10">
                  <X className="size-5" aria-hidden />
                </Dialog.Close>
              </div>
              <nav aria-label="Menú completo" className="flex-1 overflow-y-auto">
                <NavList onNavigate={() => setDrawer(false)} />
              </nav>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>

      <EddieButton />
    </>
  );
}
