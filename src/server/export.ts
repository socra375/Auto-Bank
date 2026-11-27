import { money, toCsv, type Cell } from "@/lib/csv";
import { CURRENCIES } from "@/lib/money";
import { TYPE_LABEL } from "@/components/finance/format";
import type { Executor } from "./executor";
import { listMovements } from "./ledger";
import { CASH_LINES, balancesByAccount, cashFlow, comparePeriods, expensesByCategory, incomeVsExpense, loansReport, netWorthReport, previousRange, type ResolvedFilters, type Variation } from "./reports";
import type { ReportKey } from "./report-params";

export const CASH_LINE_LABEL: Record<(typeof CASH_LINES)[number], string> = {
  income: "Ingresos", expense: "Gastos", loanPrincipal: "Capital de préstamos", adjustments: "Ajustes",
  transfersInternal: "Transferencias (misma moneda)", transfersFx: "Transferencias entre monedas",
};

export const MOVEMENT_CSV_MAX = 10_000;
const pct = (v: Variation): Cell => (v.pctTenths === null ? "n/d" : Number(v.pctTenths) / 10);
const STATUS = { posted: "Vigente", reversed: "Anulado" } as const;

export interface CsvReport { filename: string; csv: string }

/**
 * One CSV per report. Every amount row carries its own Moneda column and amounts are in major units; there is never a row
 * that adds DOP and USD, and totals are emitted per currency.
 */
export async function buildReportCsv(ex: Executor, userId: string, report: ReportKey | "movimientos", f: ResolvedFilters): Promise<CsvReport> {
  const range = { from: f.from, to: f.to };
  const raw = { dateFrom: f.from, dateTo: f.to, currency: f.currency, accountId: f.accountId, granularity: f.granularity };
  let headers: string[];
  let rows: Cell[][];
  switch (report) {
    case "movimientos": {
      headers = ["Fecha", "Tipo", "Descripción", "Estado", "Categoría", "Cuenta", "Moneda", "Partida", "Monto"];
      rows = [];
      for (let page = 1; rows.length < MOVEMENT_CSV_MAX; page++) {
        const r = await listMovements(ex, userId, { from: f.from, to: f.to, currency: f.currency, accountId: f.accountId, page, pageSize: 100 });
        for (const m of r.items) for (const l of m.legs) {
          rows.push([m.date, TYPE_LABEL[m.type] ?? m.type, m.description, STATUS[m.status], m.categoryName ?? "", l.accountName, l.currency, l.kind, money(l.amountMinor)]);
        }
        if (page * 100 >= r.total) break;
      }
      break;
    }
    case "ingresos-gastos": {
      const r = await incomeVsExpense(ex, userId, raw);
      headers = ["Moneda", "Período", "Ingresos", "Gastos", "Neto"];
      rows = r.byCurrency.flatMap((c) => [
        ...c.series.map((p): Cell[] => [c.currency, p.bucket, money(p.incomeMinor), money(p.expenseMinor), money(p.netMinor)]),
        [c.currency, "Total", money(c.incomeMinor), money(c.expenseMinor), money(c.netMinor)],
      ]);
      break;
    }
    case "flujo": {
      const r = await cashFlow(ex, userId, raw);
      headers = ["Moneda", "Período", ...CASH_LINES.map((k) => CASH_LINE_LABEL[k]), "Flujo neto"];
      rows = r.byCurrency.flatMap((c) => [
        ...c.series.map((p): Cell[] => [c.currency, p.bucket, ...CASH_LINES.map((k) => money(p.lines[k])), money(p.netMinor)]),
        [c.currency, "Total", ...CASH_LINES.map((k) => money(c.lines[k])), money(c.netMinor)],
      ]);
      break;
    }
    case "balances": {
      const r = await balancesByAccount(ex, userId, { asOf: f.to, currency: f.currency });
      headers = ["Cuenta", "Tipo", "Moneda", "Estado", `Saldo al ${r.asOf}`];
      rows = [
        ...r.rows.map((a): Cell[] => [a.name, a.type, a.currency, a.status === "active" ? "Activa" : "Archivada", money(a.balanceMinor)]),
        ...CURRENCIES.filter((c) => !f.currency || c === f.currency).map((c): Cell[] => ["Total cuentas activas", "", c, "", money(r.activeTotals[c])]),
      ];
      break;
    }
    case "categorias": {
      const r = await expensesByCategory(ex, userId, raw);
      headers = ["Moneda", "Categoría", "Monto", "Porcentaje"];
      rows = r.byCurrency.flatMap((c) => c.items.map((i): Cell[] => [c.currency, i.name, money(i.amountMinor), i.sharePermille / 10]));
      break;
    }
    case "prestamos": {
      const r = await loansReport(ex, userId, raw);
      headers = ["Moneda", "Por cobrar (cantidad)", "Por cobrar (pendiente)", "Por pagar (cantidad)", "Por pagar (pendiente)",
        "Vencidos por cobrar (pendiente)", "Vencidos por pagar (pendiente)", "Interés cobrado (período)", "Interés pagado (período)"];
      rows = r.byCurrency.map((c): Cell[] => [c.currency, c.receivable.count, money(c.receivable.outstandingMinor), c.payable.count, money(c.payable.outstandingMinor),
        money(c.overdueReceivable.outstandingMinor), money(c.overduePayable.outstandingMinor), money(c.interestCollectedMinor), money(c.interestPaidMinor)]);
      break;
    }
    case "patrimonio": {
      const r = await netWorthReport(ex, userId, { months: 12 });
      headers = ["Fecha", "Moneda", "Cuentas", "Bienes", "Patrimonio bruto", "Obligaciones", "Por cobrar", "Patrimonio neto"];
      rows = r.evolution.flatMap((p) => CURRENCIES.map((c): Cell[] => {
        const l = p.byCurrency[c];
        return [p.date, c, money(l.accounts), money(l.assets), money(l.grossAssets), money(l.payables), money(l.receivables), money(l.net)];
      }));
      break;
    }
    case "comparacion": {
      const a = previousRange(range);
      const r = await comparePeriods(ex, userId, { a, b: range, currency: f.currency, accountId: f.accountId });
      headers = ["Moneda", "Métrica", `A: ${a.from} a ${a.to}`, `B: ${range.from} a ${range.to}`, "Variación (B - A)", "Variación %"];
      rows = r.byCurrency.flatMap((c) => ([["Ingresos", c.income], ["Gastos", c.expense], ["Neto", c.net]] as const).map(([label, v]): Cell[] =>
        [c.currency, label, money(v.a), money(v.b), money(v.absMinor), pct(v)]));
      break;
    }
  }
  const suffix = report === "balances" ? f.to : report === "patrimonio" ? "12m" : `${f.from}_${f.to}`;
  return { filename: `auto-bank-${report}-${suffix}.csv`, csv: toCsv(headers, rows) };
}
