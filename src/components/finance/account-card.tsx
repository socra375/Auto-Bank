import Link from "next/link";
import { Banknote, Landmark, PiggyBank, Plus, Smartphone, type LucideIcon } from "lucide-react";
import { formatMoney, type Currency } from "@/lib/money";
import { Chip, Contactless } from "@/components/reports/bank-card";
import { ACCOUNT_TYPE_LABEL } from "./format";

/**
 * Presentation-only account card (same visual language as the Overview BankCard). It receives values that were already computed
 * (name, type, currency, current balance) and draws decorative artwork only: aria-hidden SVG, no card numbers, no holders,
 * nothing derived from real data. Colours follow the currency (DOP navy/champagne, USD graphite/emerald); the engraving follows the type.
 */

export type AccountKind = "cash" | "bank" | "savings" | "digital";
const ICON: Record<AccountKind, LucideIcon> = { cash: Banknote, bank: Landmark, savings: PiggyBank, digital: Smartphone };
const HAS_CHIP: Record<AccountKind, boolean> = { cash: false, bank: true, savings: false, digital: true };

const r = (n: number) => Math.round(n * 10) / 10;
const W = 400, H = 252;

/** Stacked, phase-shifted sine bands (the classic engraved card background). */
function bands(count: number, y0: number, step: number, amp: number, k: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const base = y0 + i * step, a = amp + Math.sin(i / 5) * amp * 0.4, ph = i * 0.21;
    let d = "";
    for (let x = 0; x <= W; x += 8) d += `${x === 0 ? "M" : "L"}${x} ${r(base + Math.sin(x / k + ph) * a + Math.sin(x / (k / 2.8) - ph * 2) * 2.2)}`;
    out.push(d);
  }
  return out;
}
/** Concentric distorted rings around an off-centre peak (the Overview USD look). */
function contours(): string[] {
  const out: string[] = [];
  for (let k = 1; k <= 22; k++) {
    let d = "";
    for (let a = 0; a <= 360; a += 6) {
      const t = (a * Math.PI) / 180, rad = k * 9.5;
      const wob = 1 + 0.16 * Math.sin(3 * t + k * 0.25) + 0.08 * Math.sin(5 * t - k * 0.4);
      d += `${a === 0 ? "M" : "L"}${r(292 + Math.cos(t) * rad * 1.35 * wob)} ${r(70 + Math.sin(t) * rad * wob)}`;
    }
    out.push(d + "Z");
  }
  return out;
}
/** Banknote rosette: nested rings modulated by a many-lobed wave -> moire like a security print. */
function rosette(cx: number, cy: number, rad: number, rings: number, lobes: number): string[] {
  const out: string[] = [];
  for (let j = 1; j <= rings; j++) {
    const base = (rad * j) / rings, amp = 3 + (j / rings) * 4;
    let d = "";
    for (let a = 0; a <= 360; a += 4) {
      const t = (a * Math.PI) / 180, rr = base + amp * Math.sin(lobes * t + j * 0.35);
      d += `${a === 0 ? "M" : "L"}${r(cx + Math.cos(t) * rr)} ${r(cy + Math.sin(t) * rr)}`;
    }
    out.push(d + "Z");
  }
  return out;
}
function diagonals(): string[] {
  const out: string[] = [];
  for (let i = -6; i < 34; i++) out.push(`M${i * 14} ${H}L${i * 14 + 150} 0`);
  return out;
}

const BANK_DOP = bands(34, 96, 3.4, 14, 31);
const BANK_USD = contours();
const CASH_BANDS = bands(14, 150, 4.6, 7, 23);
const CASH_ROSETTE = rosette(300, 84, 62, 16, 12);
const CASH_CORNER = rosette(0, 0, 11, 4, 8);
const SAVINGS_RINGS = rosette(306, 92, 56, 5, 40);
const DIGITAL_LINES = diagonals();

function Art({ kind, currency, id }: { kind: AccountKind; currency: Currency; id: string }) {
  const stroke = { fill: "none", stroke: "var(--bc-line)", strokeLinejoin: "round" as const };
  return (
    <svg className="bc-art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <defs>
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={currency === "DOP" ? 4 : 11} />
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
        <radialGradient id={`${id}-spot`} cx="0.78" cy="0.34" r="0.55">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-m`}><rect width={W} height={H} fill={`url(#${id}-fade)`} /></mask>
        <mask id={`${id}-s`}><rect width={W} height={H} fill={`url(#${id}-spot)`} /></mask>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-glow)`} />

      {kind === "bank" && (
        <g mask={`url(#${id}-m)`} {...stroke} strokeWidth="0.7" opacity="0.23">
          {(currency === "DOP" ? BANK_DOP : BANK_USD).map((d, i) => <path key={i} d={d} />)}
        </g>
      )}

      {kind === "cash" && (
        <>
          <g mask={`url(#${id}-s)`} {...stroke} strokeWidth="0.6" opacity="0.34">{CASH_ROSETTE.map((d, i) => <path key={i} d={d} />)}</g>
          <g mask={`url(#${id}-m)`} {...stroke} strokeWidth="0.6" opacity="0.2">{CASH_BANDS.map((d, i) => <path key={i} d={d} />)}</g>
          <rect x="11" y="11" width={W - 22} height={H - 22} rx="12" {...stroke} strokeWidth="0.9" strokeDasharray="1.5 3" opacity="0.4" />
          {[[24, 24], [W - 24, 24], [24, H - 24], [W - 24, H - 24]].map(([x, y]) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y})`} {...stroke} strokeWidth="0.6" opacity="0.38">{CASH_CORNER.map((d, i) => <path key={i} d={d} />)}</g>
          ))}
        </>
      )}

      {kind === "savings" && (
        <g {...stroke}>
          <g mask={`url(#${id}-s)`} strokeWidth="0.7" opacity="0.4">
            {SAVINGS_RINGS.map((d, i) => <path key={i} d={d} />)}
            <circle cx="306" cy="92" r="64" strokeWidth="1.6" strokeDasharray="1.2 2.4" />
            <circle cx="306" cy="92" r="72" strokeWidth="0.6" />
          </g>
          {/* growth motif: a rising stepped curve under the coin */}
          <g mask={`url(#${id}-m)`} strokeWidth="1" opacity="0.32" strokeLinecap="round">
            <path d="M190 232C226 228 238 206 262 198S318 190 344 160S380 136 392 126" />
            <path d="M190 240C226 236 240 216 266 208S322 202 348 172S384 148 396 138" opacity="0.55" />
            <path d="M380 120l12 6-4 12" />
          </g>
        </g>
      )}

      {kind === "digital" && (
        <g>
          <g mask={`url(#${id}-s)`} {...stroke} strokeWidth="0.6" opacity="0.3">{DIGITAL_LINES.map((d, i) => <path key={i} d={d} />)}</g>
          <g fill="var(--bc-line)" opacity="0.28">
            {Array.from({ length: 5 }, (_, row) => Array.from({ length: 12 }, (_, col) => <circle key={`${row}-${col}`} cx={236 + col * 13} cy={26 + row * 13} r="1.15" />))}
          </g>
        </g>
      )}

      <rect width={W} height={H} filter={`url(#${id}-grain)`} opacity="0.16" style={{ mixBlendMode: "overlay" }} />
    </svg>
  );
}

export function AccountCard({
  uid, name, type, currency, balanceMinor, archived = false,
}: { uid: string; name: string; type: AccountKind | string; currency: Currency; balanceMinor: bigint; archived?: boolean }) {
  const kind = (type in ICON ? type : "bank") as AccountKind;
  const Icon = ICON[kind];
  const id = `ac-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <div className="bc-wrap">
      <div className={`bc ac ac-${kind} bc-${currency.toLowerCase()}${archived ? " ac-archived" : ""}`}>
        <Art kind={kind} currency={currency} id={id} />
        <span className="bc-sheen" aria-hidden />
        <div className="bc-body ac-body">
          <div className="ac-top">
            <p className="ac-type"><Icon aria-hidden />{ACCOUNT_TYPE_LABEL[kind]}</p>
            <p className="ac-cur">
              {archived && <span className="ac-badge">Archivada</span>}
              <span className="bc-code">{currency}</span>
            </p>
          </div>
          <div className="ac-mid">
            {HAS_CHIP[kind] ? <><Chip id={id} /><Contactless /></> : null}
          </div>
          <div className="ac-bottom">
            <h3 className="ac-name">{name}</h3>
            <p className="bc-label">Saldo actual</p>
            <p className={`bc-net ac-bal${balanceMinor < 0n ? " bc-neg" : ""}`}>{formatMoney(balanceMinor, currency)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Card-shaped tile that leads to the (existing) create form. */
export function NewAccountTile({ href }: { href: string }) {
  return (
    <div className="bc-wrap">
      <Link href={href} className="ac-new" aria-label="Nueva cuenta: abrir el formulario de creación">
        <span className="ac-new-icon" aria-hidden><Plus /></span>
        <span className="ac-new-title">Nueva cuenta</span>
        <span className="ac-new-hint">Efectivo, banco, ahorro o digital</span>
      </Link>
    </div>
  );
}
