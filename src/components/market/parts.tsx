import { ArrowDown, ArrowUp, CircleSlash, Clock, Radio } from "lucide-react";
import type { Quote, QuoteStatus, Reason } from "@/server/market/types";
import { cn } from "@/lib/utils";

const TZ = "America/Santo_Domingo";
const DT = new Intl.DateTimeFormat("es-DO", { timeZone: TZ, dateStyle: "short", timeStyle: "medium" });

/** ISO -> "dd/mm/aaaa, hh:mm:ss a. m." in America/Santo_Domingo; "—" when absent. */
export function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : DT.format(t);
}

export function fmtNum(n: number | null | undefined, opts: { signed?: boolean; max?: number } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const max = opts.max ?? (Math.abs(n) < 10 ? 5 : 2);
  return new Intl.NumberFormat("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: max, signDisplay: opts.signed ? "exceptZero" : "auto" }).format(n);
}
export const fmtVolume = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat("es-DO", { notation: "compact", maximumFractionDigits: 2 }).format(n);

export const REASON_TEXT: Record<Reason, string> = {
  not_configured: "Sin proveedor de datos configurado. Define MARKET_PROVIDER=twelvedata y MARKET_API_KEY en el servidor.",
  rate_limited: "No disponible (límite del proveedor)",
  symbol_not_found: "El proveedor no reconoce este símbolo",
  plan_not_supported: "Este símbolo no está incluido en tu plan del proveedor",
  auth: "El proveedor rechazó la clave (revisa MARKET_API_KEY)",
  provider_error: "El proveedor no respondió",
  invalid_response: "Respuesta del proveedor no reconocida",
  stale: "Último dato recibido; el proveedor no respondió ahora",
};

const STATUS: Record<QuoteStatus, { label: string; Icon: typeof Radio; cls: string }> = {
  realtime: { label: "Tiempo real", Icon: Radio, cls: "badge-positive" },
  delayed: { label: "Retrasada", Icon: Clock, cls: "badge-info" },
  unavailable: { label: "No disponible", Icon: CircleSlash, cls: "badge-neutral" },
};

export function StatusBadge({ status }: { status: QuoteStatus }) {
  const { label, Icon, cls } = STATUS[status];
  return (
    <span className={cn("badge", cls)}>
      <Icon className="size-3" aria-hidden />{label}
    </span>
  );
}

/** Sign and arrow carry the direction; colour is only reinforcement. */
export function Change({ q }: { q: Quote }) {
  if (q.status === "unavailable" || (q.change === null && q.changePct === null)) return <span className="text-muted">—</span>;
  const v = q.change ?? q.changePct ?? 0;
  const Icon = v > 0 ? ArrowUp : v < 0 ? ArrowDown : null;
  return (
    <span className={cn("inline-flex items-center gap-1", v > 0 && "text-positive", v < 0 && "text-negative")}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      <span>{fmtNum(q.change, { signed: true })}</span>
      <span>({q.changePct === null ? "—" : `${fmtNum(q.changePct, { signed: true, max: 2 })}%`})</span>
    </span>
  );
}

export function reasonText(q: { reason: Reason | null; detail: string | null }): string | null {
  if (!q.reason) return null;
  return REASON_TEXT[q.reason] + (q.detail && q.reason !== "not_configured" ? ` — «${q.detail}»` : "");
}
