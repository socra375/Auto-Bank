import type { Metadata } from "next";
import Link from "next/link";
import type { SearchParams } from "@/components/finance/filters";
import { PillNav, ExportLink } from "@/components/reports/parts";
import {
  BalancesSection, CashFlowSection, CategoriesSection, ComparisonSection, IncomeExpenseSection, LoansSection, NetWorthSection,
} from "@/components/reports/report-sections";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/states/states";
import { Field, inputCls, Options } from "@/components/ui/fields";
import { requireOwner } from "@/lib/auth/guard";
import { CURRENCIES } from "@/lib/money";
import { safe } from "@/lib/safe";
import { listAccounts } from "@/server/accounts";
import { getExecutor } from "@/server/db";
import { parseReportQuery, REPORT_KEYS, type ReportKey } from "@/server/report-params";
import {
  balancesByAccount, cashFlow, comparePeriods, expensesByCategory, incomeVsExpense, loansReport, netWorthReport, previousRange, resolveFilters, type ResolvedFilters,
} from "@/server/reports";

export const metadata: Metadata = { title: "Reportes" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const LABEL: Record<ReportKey, string> = {
  "ingresos-gastos": "Ingresos vs gastos", flujo: "Flujo de caja", balances: "Saldos por cuenta", categorias: "Gastos por categoría",
  prestamos: "Préstamos y deudas", patrimonio: "Patrimonio", comparacion: "Comparar períodos",
};
const GRAN = [{ value: "day", label: "Día" }, { value: "week", label: "Semana" }, { value: "month", label: "Mes" }];

async function section(r: ReportKey, userId: string, f: ResolvedFilters) {
  const ex = getExecutor();
  const raw = { dateFrom: f.from, dateTo: f.to, currency: f.currency, accountId: f.accountId, granularity: f.granularity };
  switch (r) {
    case "ingresos-gastos": return <IncomeExpenseSection r={await incomeVsExpense(ex, userId, raw)} />;
    case "flujo": return <CashFlowSection r={await cashFlow(ex, userId, raw)} />;
    case "balances": return <BalancesSection r={await balancesByAccount(ex, userId, { asOf: f.to, currency: f.currency })} />;
    case "categorias": return <CategoriesSection r={await expensesByCategory(ex, userId, raw)} />;
    case "prestamos": return <LoansSection r={await loansReport(ex, userId, raw)} />;
    case "patrimonio": return <NetWorthSection r={await netWorthReport(ex, userId, { months: 12 })} />;
    case "comparacion": return <ComparisonSection r={await comparePeriods(ex, userId, { a: previousRange(f), b: f, currency: f.currency, accountId: f.accountId })} />;
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const userId = await requireOwner();
  const sp = await searchParams;
  const rp = first(sp.r);
  const report: ReportKey = (REPORT_KEYS as readonly string[]).includes(rp ?? "") ? (rp as ReportKey) : "ingresos-gastos";
  const parsed = parseReportQuery((k) => first(sp[k]));
  const filters = parsed.ok ? parsed.filters : resolveFilters();
  const qs = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v) u.set(k, v);
    return u.toString();
  };
  const common = { from: filters.from, to: filters.to, moneda: filters.currency, cuenta: filters.accountId, granularidad: filters.granularity };

  const res = await safe(Promise.all([section(report, userId, filters), listAccounts(getExecutor(), userId)]));
  const usesGran = report === "ingresos-gastos" || report === "flujo";
  const usesAccount = report === "ingresos-gastos" || report === "flujo" || report === "comparacion";
  const usesCurrency = report !== "patrimonio";

  return (
    <>
      <PageHeader title="Reportes" description="Cada moneda se reporta por separado; DOP y USD nunca se suman. Los traspasos, ajustes y el capital de préstamos no son ingresos ni gastos." />
      <div className="mb-4"><PillNav label="Reportes" items={REPORT_KEYS.map((k) => ({ href: `/reportes?${qs({ ...common, r: k })}`, text: LABEL[k], active: k === report }))} /></div>

      <form method="get" action="/reportes" className="mb-4 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="r" value={report} />
        {report !== "patrimonio" && (
          <>
            {report !== "balances" && <Field label="Desde" id="r-from"><input id="r-from" name="from" type="date" defaultValue={filters.from} className={inputCls} /></Field>}
            <Field label={report === "balances" ? "Saldo al" : "Hasta"} id="r-to"><input id="r-to" name="to" type="date" defaultValue={filters.to} className={inputCls} /></Field>
          </>
        )}
        {usesCurrency && (
          <Field label="Moneda" id="r-moneda">
            <select id="r-moneda" name="moneda" defaultValue={filters.currency ?? ""} className={inputCls}><Options placeholder="Todas" items={CURRENCIES.map((c) => ({ value: c, label: c }))} /></select>
          </Field>
        )}
        {usesAccount && (
          <Field label="Cuenta" id="r-cuenta">
            <select id="r-cuenta" name="cuenta" defaultValue={filters.accountId ?? ""} className={inputCls}>
              <Options placeholder="Todas" items={(res.failed ? [] : res.data[1]).map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))} />
            </select>
          </Field>
        )}
        {usesGran && (
          <Field label="Agrupar por" id="r-gran">
            <select id="r-gran" name="granularidad" defaultValue={filters.granularity} className={inputCls}><Options items={GRAN} /></select>
          </Field>
        )}
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white">Aplicar</button>
          <Link href={`/reportes?r=${report}`} className="rounded-md border border-border px-4 py-2 text-sm">Limpiar</Link>
        </div>
      </form>
      {!parsed.ok && <p role="alert" className="mb-4 text-sm text-negative">{parsed.error} Se usó el período por defecto (últimos 30 días).</p>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{LABEL[report]}</h2>
        <div className="flex gap-2">
          <ExportLink href={`/api/export/${report}?${qs(common)}`} />
          {report === "ingresos-gastos" && <ExportLink href={`/api/export/movimientos?${qs(common)}`} label="Exportar movimientos (CSV)" />}
        </div>
      </div>

      {res.failed ? <ErrorState title="No se pudo generar el reporte" description="Inténtalo de nuevo en unos segundos." /> : res.data[0]}
    </>
  );
}
