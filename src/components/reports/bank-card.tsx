import { ArrowDownLeft, ArrowUpRight, Landmark, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatMoney, type Currency } from "@/lib/money";

/**
 * Presentation-only "premium bank card" for the per-currency net worth. It receives already-computed
 * values (no calculations here) and draws purely decorative artwork (aria-hidden SVG/CSS, no scripts).
 */

const NAMES: Record<Currency, string> = { DOP: "Peso dominicano", USD: "Dólar estadounidense" };

export type CardFigures = {
  currency: Currency;
  net: bigint;
  disponible: bigint;
  receivable: bigint;
  payable: bigint;
  income: bigint;
  expense: bigint;
  periodNet: bigint;
};

const r = (n: number) => Math.round(n * 10) / 10;

/** Engraved guilloche: stacked, phase-shifted sine bands (deterministic, so SSR and client agree). */
function guilloche() {
  const paths: string[] = [];
  for (let i = 0; i < 34; i++) {
    const base = 96 + i * 3.4;
    const amp = 14 + Math.sin(i / 5) * 6;
    const ph = i * 0.21;
    let d = "";
    for (let x = 0; x <= 400; x += 8) {
      const y = base + Math.sin(x / 31 + ph) * amp + Math.sin(x / 11 - ph * 2) * 2.2;
      d += `${x === 0 ? "M" : "L"}${x} ${r(y)}`;
    }
    paths.push(d);
  }
  return paths;
}

/** Topographic contours: concentric, slightly distorted rings around an off-centre peak. */
function contours() {
  const paths: string[] = [];
  for (let k = 1; k <= 22; k++) {
    const rad = k * 9.5;
    let d = "";
    for (let a = 0; a <= 360; a += 6) {
      const t = (a * Math.PI) / 180;
      const wob = 1 + 0.16 * Math.sin(3 * t + k * 0.25) + 0.08 * Math.sin(5 * t - k * 0.4);
      const x = 292 + Math.cos(t) * rad * 1.35 * wob;
      const y = 70 + Math.sin(t) * rad * wob;
      d += `${a === 0 ? "M" : "L"}${r(x)} ${r(y)}`;
    }
    paths.push(d + "Z");
  }
  return paths;
}
const GUILLOCHE = guilloche();
const CONTOURS = contours();

function Chip({ id }: { id: string }) {
  return (
    <svg className="bc-chip" viewBox="0 0 48 36" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-chip`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--bc-chip-a)" />
          <stop offset="0.5" stopColor="var(--bc-chip-b)" />
          <stop offset="1" stopColor="var(--bc-chip-c)" />
        </linearGradient>
      </defs>
      <rect x="0.75" y="0.75" width="46.5" height="34.5" rx="7" fill={`url(#${id}-chip)`} stroke="var(--bc-chip-edge)" strokeWidth="1" />
      <g fill="none" stroke="var(--bc-chip-edge)" strokeWidth="0.9" strokeLinecap="round">
        <path d="M16 1v8.5q0 3.5-3.5 3.5H1M16 35v-8.5q0-3.5-3.5-3.5H1M32 1v8.5q0 3.5 3.5 3.5H47M32 35v-8.5q0-3.5 3.5-3.5H47" />
        <path d="M16 13h16v10H16z" />
        <path d="M24 1v12M24 23v12" />
      </g>
    </svg>
  );
}

function Contactless() {
  return (
    <svg className="bc-nfc" viewBox="0 0 24 24" aria-hidden focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M7 8.5a5 5 0 0 1 0 7" />
      <path d="M10.8 6a9 9 0 0 1 0 12" />
      <path d="M14.6 3.6a13 13 0 0 1 0 16.8" />
      <path d="M18.4 1.5a16.6 16.6 0 0 1 0 21" opacity=".55" />
    </svg>
  );
}

function Art({ currency, id }: { currency: Currency; id: string }) {
  return (
    <svg className="bc-art" viewBox="0 0 400 252" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <defs>
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={currency === "DOP" ? 4 : 11} result="n" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <radialGradient id={`${id}-glow`} cx="0.9" cy="0.62" r="0.7">
          <stop offset="0" stopColor="var(--bc-glow)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--bc-glow)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.75" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.05" />
        </linearGradient>
        <radialGradient id={`${id}-spot`} cx="0.9" cy="0.47" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-s`}><rect width="400" height="252" fill={`url(#${id}-spot)`} /></mask>
        <mask id={`${id}-m`}><rect width="400" height="252" fill={`url(#${id}-fade)`} /></mask>
      </defs>
      <rect width="400" height="252" fill={`url(#${id}-glow)`} />
      {[{ m: "m", o: 0.23 }].map((l) => (
        <g key={l.m} mask={`url(#${id}-${l.m})`} fill="none" stroke="var(--bc-line)" strokeWidth="0.7" strokeLinejoin="round" opacity={l.o}>
          {(currency === "DOP" ? GUILLOCHE : CONTOURS).map((d, i) => <path key={i} d={d} />)}
        </g>
      ))}
      <rect width="400" height="252" filter={`url(#${id}-grain)`} opacity="0.16" style={{ mixBlendMode: "overlay" }} />
    </svg>
  );
}

function Fig({ label, icon: Icon, children, tone }: { label: string; icon?: typeof ArrowDownLeft; children: React.ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="bc-fig">
      <dt>{Icon && <Icon aria-hidden />}{label}</dt>
      <dd className={tone === "pos" ? "bc-pos" : tone === "neg" ? "bc-neg" : undefined}>{children}</dd>
    </div>
  );
}

function Stat({ label, icon: Icon, children, tone }: { label: string; icon: typeof TrendingUp; children: React.ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted"><Icon className={`size-3.5 shrink-0 ${tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : ""}`} aria-hidden />{label}</dt>
      <dd className={`amount mt-0.5 text-sm sm:text-[0.9375rem] ${tone === "pos" ? "pos" : tone === "neg" ? "neg" : ""}`}>{children}</dd>
    </div>
  );
}

export function BankCard({ f }: { f: CardFigures }) {
  const c = f.currency;
  const id = `bc-${c}`;
  const NetIcon = f.periodNet > 0n ? TrendingUp : f.periodNet < 0n ? TrendingDown : Minus;
  const netTone = f.periodNet > 0n ? "pos" : f.periodNet < 0n ? "neg" : undefined;
  return (
    <article className="bc-wrap" aria-label={`Resumen en ${c}`}>
      <div className={`bc bc-${c.toLowerCase()}`}>
        <Art currency={c} id={id} />
        <span className="bc-sheen" aria-hidden />
        <div className="bc-body">
          <div className="bc-top">
            <p className="bc-brand"><span className="bc-mark" aria-hidden>AB</span>Auto-Bank</p>
            <p className="bc-cur"><span className="bc-code">{c}</span><span className="bc-name">{NAMES[c]}</span></p>
          </div>
          <div className="bc-mid">
            <Chip id={id} />
            <Contactless />
          </div>
          <div className="bc-hero">
            <p className="bc-label">Patrimonio neto</p>
            <p className="bc-net">{formatMoney(f.net, c)}</p>
          </div>
          <dl className="bc-figs">
            <Fig label="Disponible">{formatMoney(f.disponible, c)}</Fig>
            <Fig label="Por cobrar" icon={ArrowDownLeft} tone="pos">{formatMoney(f.receivable, c)}</Fig>
            <Fig label="Por pagar" icon={ArrowUpRight} tone="neg">{formatMoney(f.payable, c)}</Fig>
          </dl>
        </div>
      </div>
      <dl className="bc-strip">
        <Stat label="Ingresos del período" icon={TrendingUp} tone="pos"><span>+{formatMoney(f.income, c)}</span></Stat>
        <Stat label="Gastos del período" icon={TrendingDown} tone="neg"><span>-{formatMoney(f.expense, c)}</span></Stat>
        <Stat label="Neto del período" icon={f.periodNet === 0n ? Landmark : NetIcon} tone={netTone}>
          <span>{f.periodNet > 0n ? "+" : ""}{formatMoney(f.periodNet, c)}</span>
        </Stat>
      </dl>
    </article>
  );
}
