import { fmtDate } from "@/lib/dates";
import { formatMoney, type Currency } from "@/lib/money";
import type { Granularity } from "@/server/reports";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-02-01" -> "01/02" (day), "Sem. 01/02" (week), "feb 2026" (month). */
export function bucketLabel(bucket: string, g: Granularity): string {
  if (g === "month") return `${MONTHS[Number(bucket.slice(5, 7)) - 1]} ${bucket.slice(0, 4)}`;
  const d = fmtDate(bucket).slice(0, 5);
  return g === "week" ? `Sem. ${d}` : d;
}

export type BarSeries = { name: string; values: bigint[]; tone: "positive" | "negative" | "primary"; hatched?: boolean };

const FILL = { positive: "var(--positive)", negative: "var(--negative)", primary: "var(--primary)" } as const;

/**
 * Accessible grouped bar chart (inline SVG, no chart library). Bars are drawn from a zero baseline. It is a picture only:
 * the exact figures must be rendered next to it as a table, and the series are told apart by label and hatching, not by colour alone.
 */
export function BarChart({ id, categories, series, currency, ariaLabel }: { id: string; categories: string[]; series: BarSeries[]; currency: Currency; ariaLabel: string }) {
  const W = 340, H = 170, top = 10, bottom = 24, left = 40;
  const nums = series.flatMap((s) => s.values.map(Number)); // display only
  // "Nice" 1-2-5 axis (values are minor units): round ticks instead of 166.7 / 83.3.
  const rawMax = Math.max(0, ...nums), rawMin = Math.min(0, ...nums);
  const base = ((rawMax - rawMin) || 100) / 100 / 3, pow = 10 ** Math.floor(Math.log10(base)), f = base / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow * 100;
  const max = Math.ceil(rawMax / step) * step, min = Math.floor(rawMin / step) * step, span = max - min || step;
  const plotH = H - top - bottom, plotW = W - left;
  const y = (v: number) => top + ((max - v) / span) * plotH;
  const zero = y(0);
  const slot = plotW / Math.max(categories.length, 1);
  const gap = Math.min(slot * 0.25, 6), bw = Math.max((slot - gap) / series.length, 1);
  const every = Math.ceil(categories.length / 5);
  const ticks: number[] = [];
  for (let t = min; t <= max + 1e-6; t += step) ticks.push(t);
  const num = (n: number, d: number) => n.toLocaleString("es-DO", { maximumFractionDigits: d });
  const compact = { format: (n: number) => { const a = Math.abs(n), s = n < 0 ? "-" : ""; return a >= 1e6 ? `${s}${num(a / 1e6, 1)} M` : a >= 1e3 ? `${s}${num(a / 1e3, 1)} k` : `${s}${num(a, 2)}`; } };
  return (
    <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <defs>
        {series.map((s, k) => s.hatched && (
          <pattern key={s.name} id={`${id}-h${k}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="var(--surface)" /><line x1="0" y1="0" x2="0" y2="4" stroke={FILL[s.tone]} strokeWidth="2" />
          </pattern>
        ))}
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={Math.abs(t) < 1e-9 ? undefined : "3 3"} />
          <text x={left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">{compact.format(t / 100)}</text>
        </g>
      ))}
      <line x1={left} x2={W} y1={zero} y2={zero} stroke="var(--border-strong)" />
      {categories.map((cat, i) => (
        <g key={cat + i}>
          {series.map((s, k) => {
            const v = Number(s.values[i]);
            const yy = y(Math.max(v, 0)), h = Math.max(Math.abs(y(v) - zero), v === 0 ? 0 : 1);
            return (
              <rect key={s.name} x={left + i * slot + gap / 2 + k * bw} y={v >= 0 ? yy : zero} width={bw} height={h} rx="2"
                fill={s.hatched ? `url(#${id}-h${k})` : FILL[s.tone]} stroke={FILL[s.tone]}>
                <title>{`${cat} · ${s.name}: ${formatMoney(s.values[i], currency)}`}</title>
              </rect>
            );
          })}
          {i % every === 0 && <text x={left + i * slot + slot / 2} y={H - 7} textAnchor="middle" fontSize="10" fill="var(--muted)">{cat}</text>}
        </g>
      ))}
    </svg>
  );
}

export function Legend({ items }: { items: { name: string; tone: BarSeries["tone"]; hatched?: boolean }[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted" aria-label="Leyenda">
      {items.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <svg width="12" height="12" aria-hidden><rect width="12" height="12" fill={s.hatched ? "none" : FILL[s.tone]} stroke={FILL[s.tone]} strokeWidth="2" strokeDasharray={s.hatched ? "3 2" : undefined} /></svg>
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/** Horizontal share bars: every bar has its label, amount and % printed next to it. */
export function ShareBars({ items, currency }: { items: { label: string; minor: bigint; permille: number }[]; currency: Currency }) {
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{it.label}</span>
            <span className="amount shrink-0 text-sm">{formatMoney(it.minor, currency)} <span className="font-normal text-muted">· {(it.permille / 10).toFixed(1)}%</span></span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-border" aria-hidden><div className="h-2 rounded-full bg-primary" style={{ width: `${it.permille / 10}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
