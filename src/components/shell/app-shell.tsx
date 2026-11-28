"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { savePref, SIDEBAR_COOKIE } from "@/lib/theme";
import { ALL_ITEMS, MOBILE_PRIMARY } from "./nav";
import { NavList } from "./nav-list";
import { EddieButton } from "./eddie";
import { signOutAction } from "@/lib/auth/actions";
import { Logo } from "@/components/brand/logo";

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/overview" className="brand-link flex min-h-11 items-center rounded-lg px-2" aria-label="Auto-Bank, ir al resumen">
      {collapsed ? <Logo variant="mark" size={40} /> : <Logo variant="horizontal" size={40} />}
    </Link>
  );
}

const sideBtn = "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-[var(--sidebar-fg)] transition-colors hover:bg-white/10 hover:text-white";

export function AppShell({ children, initialCollapsed = false }: { children: ReactNode; initialCollapsed?: boolean }) {
  // The collapsed state is remembered in a cookie that the server layout reads, so there is no layout jump on load.
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const primary = ALL_ITEMS.filter((i) => MOBILE_PRIMARY.includes(i.href));
  const section = ALL_ITEMS.find((i) => pathname.startsWith(i.href))?.label ?? "Auto-Bank";
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    savePref(SIDEBAR_COOKIE, next ? "1" : "0");
  };

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-[var(--shadow-pop)]"
      >
        Saltar al contenido
      </a>

      <aside
        aria-label="Barra lateral"
        className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-white/10 bg-sidebar p-2 transition-[width] motion-reduce:transition-none md:flex", collapsed ? "w-[4.5rem]" : "w-64")}
      >
        <Brand collapsed={collapsed} />
        <nav aria-label="Principal" className="mt-4 flex-1 overflow-y-auto">
          <NavList collapsed={collapsed} />
        </nav>
        <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
          <form action={signOutAction}>
            <button type="submit" className={cn(sideBtn, collapsed && "justify-center px-2")} title={collapsed ? "Cerrar sesión" : undefined}>
              <LogOut className="size-5 shrink-0" aria-hidden />
              <span className={cn(collapsed && "sr-only")}>Cerrar sesión</span>
            </button>
          </form>
          <button
            type="button" onClick={toggle} aria-expanded={!collapsed}
            className={cn(sideBtn, collapsed && "justify-center px-2")}
          >
            {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
            <span className={cn(collapsed && "sr-only")}>{collapsed ? "Expandir menú" : "Contraer menú"}</span>
          </button>
        </div>
      </aside>

      <div className={cn("transition-[padding] motion-reduce:transition-none", collapsed ? "md:pl-[4.5rem]" : "md:pl-64")}>
        <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Logo variant="mark" panel size={32} className="md:hidden" />
            <p className="truncate text-sm font-semibold text-muted"><span className="hidden md:inline">Auto-Bank / </span><span className="text-text">{section}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted lg:inline">DOP y USD por separado</span>
            <EddieButton />
          </div>
        </header>
        <main id="contenido" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-28 pt-6 outline-none md:px-8 md:pb-12 md:pt-8">
          {children}
        </main>
      </div>

      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/10 bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {primary.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium text-[var(--sidebar-fg)]", active && "text-white")}
            >
              <Icon className={cn("size-5", active && "stroke-[2.5]")} aria-hidden />
              <span className="truncate">{item.label.split(" ")[0]}</span>
              <span aria-hidden className="nav-ind h-0.5 w-6 rounded-full bg-white" />
            </Link>
          );
        })}
        <Dialog.Root open={drawer} onOpenChange={setDrawer}>
          <Dialog.Trigger className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium text-[var(--sidebar-fg)]">
            <Menu className="size-5" aria-hidden />
            <span>Más</span>
            <span aria-hidden className="h-0.5 w-6" />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay data-veil className="fixed inset-0 z-40 bg-[var(--overlay)]" />
            <Dialog.Content
              aria-describedby={undefined}
              data-sheet="left"
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar p-2 shadow-[var(--shadow-pop)]"
            >
              <div className="flex items-center justify-between">
                <Dialog.Title className="px-3 py-2"><Logo variant="horizontal" size={36} /></Dialog.Title>
                <Dialog.Close aria-label="Cerrar menú" className="grid size-11 place-items-center rounded-lg text-[var(--sidebar-fg)] hover:bg-white/10">
                  <X className="size-5" aria-hidden />
                </Dialog.Close>
              </div>
              <nav aria-label="Menú completo" className="flex-1 overflow-y-auto">
                <NavList onNavigate={() => setDrawer(false)} />
              </nav>
              <form action={signOutAction} className="border-t border-white/10 pt-2">
                <button type="submit" className={sideBtn}><LogOut className="size-5" aria-hidden /> Cerrar sesión</button>
              </form>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>
    </>
  );
}
