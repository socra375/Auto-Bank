import { reportFiltersSchema, type ReportFilters } from "./schemas";
import { resolveFilters, type ResolvedFilters } from "./reports";

export const REPORT_KEYS = ["ingresos-gastos", "flujo", "balances", "categorias", "prestamos", "patrimonio", "comparacion"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** URL params shared by /reportes and /api/export: from, to, moneda, cuenta, granularidad. Invalid input -> { ok: false, error }. */
export function parseReportQuery(get: (key: string) => string | undefined): { ok: true; filters: ResolvedFilters } | { ok: false; error: string } {
  const raw: ReportFilters = {
    dateFrom: get("from") || undefined, dateTo: get("to") || undefined, currency: (get("moneda") || undefined) as ReportFilters["currency"],
    accountId: get("cuenta") || undefined, granularity: (get("granularidad") || undefined) as ReportFilters["granularity"],
  };
  const p = reportFiltersSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Filtros inválidos." };
  return { ok: true, filters: resolveFilters(raw) };
}
