import Link from "next/link";
import { formatMoney, type Currency } from "@/lib/money";
import type { Variation } from "@/server/reports";

export const tone = (minor: bigint) => (minor > 0n ? "text-positive" : minor < 0n ? "text-negative" : "");

export function Money({ minor, currency, signed = false }: { minor: bigint; currency: Currency; signed?: boolean }) {
  return <span className={signed ? tone(minor) : ""}>{signed && minor > 0n ? "+" : ""}{formatMoney(minor, currency)}</span>;
}

export const NO_DATA = "Aún no hay datos para este período. Registra movimientos y aparecerán aquí.";

export function NoData({ text = NO_DATA }: { text?: string }) {
  return <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">{text}</p>;
}

/** Table alternative of a chart; open by default so the figures are always reachable without the picture. */
export function ChartTable({ summary = "Ver tabla de datos", children }: { summary?: string; children: React.ReactNode }) {
  return (
    <details open className="mt-3 text-sm">
      <summary className="cursor-pointer select-none text-xs font-medium text-primary">{summary}</summary>
      <div className="mt-2 overflow-x-auto">{children}</div>
    </details>
  );
}

export const th = "py-1 pr-3 text-right font-medium";

export function Pct({ v }: { v: Variation }) {
  if (v.pctTenths === null) return <span className="text-muted" title="No hay base para calcular el porcentaje">—</span>;
  const n = Number(v.pctTenths) / 10;
  return <span className={tone(v.pctTenths)}>{n > 0 ? "+" : ""}{n.toFixed(1)}%</span>;
}

export function ExportLink({ href, label = "Exportar CSV" }: { href: string; label?: string }) {
  // A plain anchor: the response is a file download, not a page navigation.
  return <a href={href} download className="inline-block rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-primary">{label}</a>;
}

export function PillNav({ label, items }: { label: string; items: { href: string; text: string; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2 text-sm">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.active ? "page" : undefined}
          className={`rounded-md border px-3 py-1.5 ${i.active ? "border-primary bg-primary text-white" : "border-border bg-surface"}`}>{i.text}</Link>
      ))}
    </nav>
  );
}
