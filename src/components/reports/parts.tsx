import Link from "next/link";
import { Download } from "lucide-react";
import { formatMoney, type Currency } from "@/lib/money";
import type { Variation } from "@/server/reports";

export const tone = (minor: bigint) => (minor > 0n ? "text-positive" : minor < 0n ? "text-negative" : "");

/** Signed amounts carry "+"/"-" and an arrow glyph, so direction never depends on colour alone. */
export function Money({ minor, currency, signed = false }: { minor: bigint; currency: Currency; signed?: boolean }) {
  return (
    <span className={signed ? tone(minor) : ""}>
      {signed && minor > 0n ? "+" : ""}{formatMoney(minor, currency)}
    </span>
  );
}

export const NO_DATA = "Aún no hay datos para este período. Registra movimientos y aparecerán aquí.";

export function NoData({ text = NO_DATA }: { text?: string }) {
  return <p className="rounded-xl border border-dashed border-border-strong/60 bg-surface px-4 py-8 text-center text-sm text-muted">{text}</p>;
}

/** Table alternative of a chart; open by default so the figures are always reachable without the picture. */
export function ChartTable({ summary = "Ver tabla de datos", children }: { summary?: string; children: React.ReactNode }) {
  return (
    <details open className="mt-4 text-sm">
      <summary className="flex min-h-9 cursor-pointer select-none items-center text-xs font-semibold text-primary">{summary}</summary>
      <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label={summary}>{children}</div>
    </details>
  );
}

export const th = "num";

export function Pct({ v }: { v: Variation }) {
  if (v.pctTenths === null) return <span className="text-muted" title="No hay base para calcular el porcentaje">—</span>;
  const n = Number(v.pctTenths) / 10;
  return <span className={tone(v.pctTenths)}>{n > 0 ? "+" : ""}{n.toFixed(1)}%</span>;
}

export function ExportLink({ href, label = "Exportar CSV" }: { href: string; label?: string }) {
  // A plain anchor: the response is a file download, not a page navigation.
  return <a href={href} download className="btn btn-secondary btn-sm"><Download className="size-4" aria-hidden />{label}</a>;
}

export function PillNav({ label, items }: { label: string; items: { href: string; text: string; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] sm:flex-wrap">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.active ? "page" : undefined}
          className="pill">{i.text}</Link>
      ))}
    </nav>
  );
}
