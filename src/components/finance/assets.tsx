import Link from "next/link";
import { fmtDate } from "@/lib/dates";
import { CURRENCIES, formatMoney, type Currency } from "@/lib/money";
import type { AssetRow, AssetType, NetWorth, NetWorthLine, ValuationRow } from "@/server/assets";
import type { Consolidated } from "@/server/fx";
import { SIN_TASA_LABEL } from "@/server/fx";

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  real_estate: "Inmuebles", vehicle: "Vehículos", technology: "Equipos tecnológicos", furniture: "Mobiliario", other: "Otros bienes",
};
export const ASSET_TYPE_ORDER: AssetType[] = ["real_estate", "vehicle", "technology", "furniture", "other"];

export function AssetCard({ a }: { a: AssetRow }) {
  return (
    <li className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            <Link href={`/patrimonio/${a.id}`} className="underline-offset-2 hover:text-primary hover:underline">{a.name}</Link>
          </h3>
          <p className="text-xs text-muted">{a.currency}{a.status === "disposed" ? ` · De baja${a.disposedOn ? ` el ${fmtDate(a.disposedOn)}` : ""}` : ""}</p>
        </div>
        <p className="amount text-lg">{a.currentValueMinor === null ? "—" : formatMoney(a.currentValueMinor, a.currency)}</p>
      </div>
      {a.currentValuedOn && <p className="mt-1 text-xs text-muted">Valor al {fmtDate(a.currentValuedOn)}</p>}
    </li>
  );
}

function Consolidation({ label, c }: { label: string; c: Consolidated }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="amount">
        {c.status === "ok" ? formatMoney(c.totalMinor, c.currency) : <span className="text-muted">{SIN_TASA_LABEL}</span>}
      </dd>
      {c.status === "ok" && c.rates.length > 0 && (
        <p className="text-xs text-muted">{c.rates.map((r) => `1 ${r.base} al ${fmtDate(r.date)}: ${r.rate}`).join(" · ")}</p>
      )}
    </div>
  );
}

/** Per-currency cards (never mixed) plus the optional consolidated block. */
export function NetWorthPanel({ nw }: { nw: NetWorth }) {
  const rows: [string, keyof NetWorthLine, string][] = [
    ["Patrimonio bruto", "grossAssets", ""], ["Obligaciones", "payables", "neg"],
    ["Por cobrar", "receivables", "pos"], ["Patrimonio neto", "net", "font-bold"],
  ];
  return (
    <section aria-labelledby="nw" className="mb-6">
      <h2 id="nw" className="section-title mb-1">Patrimonio por moneda</h2>
      <p className="mb-4 max-w-3xl text-xs text-muted [text-wrap:pretty]">
        Bruto = saldo de todas las cuentas (incluidas las archivadas) + último valor de bienes activos. Obligaciones = capital pendiente de deudas por pagar.
        Por cobrar = capital pendiente de préstamos otorgados (aparte del bruto). Neto = bruto − obligaciones + por cobrar.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {CURRENCIES.map((c) => (
          <div key={c} className="card">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="eyebrow">Patrimonio neto</p><p className="amount-xl mt-1">{formatMoney(nw.byCurrency[c].net, c)}</p></div>
              <span className="badge badge-info">{c}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
              {rows.map(([label, k, cls]) => (
                <div key={k} className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className={`amount ${cls}`}>{formatMoney(nw.byCurrency[c][k], c)}</dd></div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-muted">
              Cuentas {formatMoney(nw.byCurrency[c].accounts, c)} · Bienes {formatMoney(nw.byCurrency[c].assets, c)}
            </p>
          </div>
        ))}
      </div>
      {nw.consolidated && (
        <div className="card mt-4">
          <p className="section-title mb-3">Consolidado en {nw.consolidated.currency} (al {fmtDate(nw.asOf)})</p>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Consolidation label="Patrimonio bruto" c={nw.consolidated.figures.grossAssets} />
            <Consolidation label="Obligaciones" c={nw.consolidated.figures.payables} />
            <Consolidation label="Por cobrar" c={nw.consolidated.figures.receivables} />
            <Consolidation label="Patrimonio neto" c={nw.consolidated.figures.net} />
          </dl>
          <p className="mt-2 text-xs text-muted">Solo con tipos de cambio registrados; las cifras por moneda de arriba son las reales.</p>
        </div>
      )}
    </section>
  );
}

/** Minimal accessible sparkline: the table next to it carries the same data. */
export function Sparkline({ values, label }: { values: bigint[]; label: string }) {
  if (values.length < 2) return null;
  const nums = values.map(Number); // display only; the exact figures are in the table
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
  const pts = nums.map((v, i) => `${(i / (nums.length - 1)) * 100},${28 - ((v - min) / span) * 26}`).join(" ");
  return (
    <svg role="img" aria-label={label} viewBox="0 0 100 30" preserveAspectRatio="none" className="h-16 w-full text-primary">
      <polygon points={`0,30 ${pts} 100,30`} fill="currentColor" opacity="0.1" />
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ValuationChart({ points, currency }: { points: ValuationRow[]; currency: Currency }) {
  return <Sparkline values={points.map((p) => p.valueMinor)} label={`Evolución de valoraciones en ${currency}, de ${fmtDate(points[0]?.valuedOn ?? "")} a ${fmtDate(points.at(-1)?.valuedOn ?? "")}`} />;
}
