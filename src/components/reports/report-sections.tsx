import { fmtDate } from "@/lib/dates";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { CASH_LINE_LABEL } from "@/server/export";
import {
  CASH_LINES, type BalancesByAccount, type CashFlow, type ExpensesByCategory, type IncomeVsExpense, type LoansReport, type NetWorthReport, type PeriodComparison,
} from "@/server/reports";
import { BarChart, bucketLabel, Legend, ShareBars } from "./charts";
import { ChartTable, Money, NoData, Pct, th } from "./parts";
import { Sparkline } from "@/components/finance/assets";

const card = "rounded-xl border border-border bg-surface p-4";
const thL = "py-1 pr-3 text-left font-medium";
const Head = ({ cols }: { cols: string[] }) => (
  <thead><tr className="text-xs text-muted"><th scope="col" className={thL}>{cols[0]}</th>{cols.slice(1).map((c) => <th key={c} scope="col" className={th}>{c}</th>)}</tr></thead>
);
const Cur = ({ children, c }: { children: React.ReactNode; c: string }) => <section aria-label={c} className={card}><h3 className="mb-2 text-sm font-medium">{c}</h3>{children}</section>;

export function IncomeExpenseSection({ r }: { r: IncomeVsExpense }) {
  const any = r.byCurrency.some((c) => c.series.length);
  if (!any) return <NoData />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {r.byCurrency.map((c) => (
        <Cur key={c.currency} c={c.currency}>
          {c.series.length === 0 ? <NoData text="Sin ingresos ni gastos en esta moneda." /> : (
            <>
              <Legend items={[{ name: "Ingresos", tone: "positive" }, { name: "Gastos", tone: "negative", hatched: true }]} />
              <BarChart id={`ie-${c.currency}`} currency={c.currency} categories={c.series.map((p) => bucketLabel(p.bucket, r.granularity))}
                ariaLabel={`Ingresos y gastos en ${c.currency} por ${r.granularity === "day" ? "día" : r.granularity === "week" ? "semana" : "mes"}`}
                series={[{ name: "Ingresos", values: c.series.map((p) => p.incomeMinor), tone: "positive" }, { name: "Gastos", values: c.series.map((p) => p.expenseMinor), tone: "negative", hatched: true }]} />
              <ChartTable>
                <table className="w-full">
                  <caption className="sr-only">Ingresos y gastos en {c.currency}</caption>
                  <Head cols={["Período", "Ingresos", "Gastos", "Neto"]} />
                  <tbody>
                    {c.series.map((p) => (
                      <tr key={p.bucket} className="border-t border-border">
                        <th scope="row" className="py-1 pr-3 text-left font-normal">{bucketLabel(p.bucket, r.granularity)}</th>
                        <td className="py-1 pr-3 text-right">{formatMoney(p.incomeMinor, c.currency)}</td>
                        <td className="py-1 pr-3 text-right">{formatMoney(p.expenseMinor, c.currency)}</td>
                        <td className="py-1 pr-3 text-right"><Money minor={p.netMinor} currency={c.currency} signed /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t border-border font-semibold">
                    <th scope="row" className="py-1 pr-3 text-left">Total</th>
                    <td className="py-1 pr-3 text-right">{formatMoney(c.incomeMinor, c.currency)}</td><td className="py-1 pr-3 text-right">{formatMoney(c.expenseMinor, c.currency)}</td>
                    <td className="py-1 pr-3 text-right"><Money minor={c.netMinor} currency={c.currency} signed /></td>
                  </tr></tfoot>
                </table>
              </ChartTable>
            </>
          )}
        </Cur>
      ))}
    </div>
  );
}

export function CashFlowSection({ r }: { r: CashFlow }) {
  if (!r.byCurrency.some((c) => c.series.length)) return <NoData />;
  return (
    <>
      <p className="mb-3 text-xs text-muted">
        Flujo de caja = ingresos − gastos + capital de préstamos + ajustes. Las transferencias entre cuentas de la misma moneda suman cero; las transferencias entre monedas
        se muestran en su propia línea (cada moneda ve solo su parte, sin conversión).
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {r.byCurrency.map((c) => (
          <Cur key={c.currency} c={c.currency}>
            {c.series.length === 0 ? <NoData text="Sin movimientos de dinero en esta moneda." /> : (
              <>
                <Legend items={[{ name: "Flujo neto (barras hacia arriba: entra más dinero del que sale)", tone: "primary" }]} />
                <BarChart id={`cf-${c.currency}`} currency={c.currency} categories={c.series.map((p) => bucketLabel(p.bucket, r.granularity))}
                  ariaLabel={`Flujo de caja neto en ${c.currency}`} series={[{ name: "Flujo neto", values: c.series.map((p) => p.netMinor), tone: "primary" }]} />
                <ChartTable>
                  <table className="w-full min-w-[34rem]">
                    <caption className="sr-only">Flujo de caja en {c.currency}</caption>
                    <Head cols={["Período", ...CASH_LINES.map((k) => CASH_LINE_LABEL[k]), "Neto"]} />
                    <tbody>
                      {c.series.map((p) => (
                        <tr key={p.bucket} className="border-t border-border">
                          <th scope="row" className="py-1 pr-3 text-left font-normal">{bucketLabel(p.bucket, r.granularity)}</th>
                          {CASH_LINES.map((k) => <td key={k} className="py-1 pr-3 text-right">{formatMoney(p.lines[k], c.currency)}</td>)}
                          <td className="py-1 pr-3 text-right font-medium"><Money minor={p.netMinor} currency={c.currency} signed /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t border-border font-semibold">
                      <th scope="row" className="py-1 pr-3 text-left">Total</th>
                      {CASH_LINES.map((k) => <td key={k} className="py-1 pr-3 text-right">{formatMoney(c.lines[k], c.currency)}</td>)}
                      <td className="py-1 pr-3 text-right"><Money minor={c.netMinor} currency={c.currency} signed /></td>
                    </tr></tfoot>
                  </table>
                </ChartTable>
              </>
            )}
          </Cur>
        ))}
      </div>
    </>
  );
}

export function BalancesSection({ r }: { r: BalancesByAccount }) {
  if (r.rows.length === 0) return <NoData text="Aún no hay cuentas con saldo a esta fecha." />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {CURRENCIES.map((c) => {
        const rows = r.rows.filter((x) => x.currency === c);
        if (!rows.length) return null;
        const pos = rows.filter((x) => x.status === "active" && x.balanceMinor > 0n);
        return (
          <Cur key={c} c={c}>
            {pos.length > 0 && <ShareBars currency={c} items={pos.map((x) => ({ label: x.name, minor: x.balanceMinor, permille: x.shareOfActivePermille }))} />}
            <ChartTable summary="Ver tabla de saldos">
              <table className="w-full">
                <caption className="sr-only">Saldos en {c} al {fmtDate(r.asOf)}</caption>
                <Head cols={["Cuenta", `Saldo al ${fmtDate(r.asOf)}`]} />
                <tbody>
                  {rows.map((x) => (
                    <tr key={x.accountId} className="border-t border-border">
                      <th scope="row" className="py-1 pr-3 text-left font-normal">{x.name}{x.status === "archived" ? " (archivada)" : ""}</th>
                      <td className="py-1 pr-3 text-right"><Money minor={x.balanceMinor} currency={c} signed /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t border-border font-semibold"><th scope="row" className="py-1 pr-3 text-left">Total cuentas activas</th><td className="py-1 pr-3 text-right">{formatMoney(r.activeTotals[c], c)}</td></tr></tfoot>
              </table>
            </ChartTable>
          </Cur>
        );
      })}
    </div>
  );
}

export function CategoriesSection({ r }: { r: ExpensesByCategory }) {
  if (!r.byCurrency.some((c) => c.items.length)) return <NoData />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {r.byCurrency.map((c) => (
        <Cur key={c.currency} c={c.currency}>
          {c.items.length === 0 ? <NoData text="Sin gastos en esta moneda." /> : (
            <>
              <ShareBars currency={c.currency} items={c.items.map((i) => ({ label: i.name, minor: i.amountMinor, permille: i.sharePermille }))} />
              <ChartTable>
                <table className="w-full">
                  <caption className="sr-only">Gastos por categoría en {c.currency}</caption>
                  <Head cols={["Categoría", "Monto", "%"]} />
                  <tbody>{c.items.map((i) => (
                    <tr key={i.name} className="border-t border-border"><th scope="row" className="py-1 pr-3 text-left font-normal">{i.name}</th>
                      <td className="py-1 pr-3 text-right">{formatMoney(i.amountMinor, c.currency)}</td><td className="py-1 pr-3 text-right">{(i.sharePermille / 10).toFixed(1)}%</td></tr>
                  ))}</tbody>
                  <tfoot><tr className="border-t border-border font-semibold"><th scope="row" className="py-1 pr-3 text-left">Total</th><td className="py-1 pr-3 text-right">{formatMoney(c.totalMinor, c.currency)}</td><td className="py-1 pr-3 text-right">100.0%</td></tr></tfoot>
                </table>
              </ChartTable>
            </>
          )}
        </Cur>
      ))}
    </div>
  );
}

export function LoansSection({ r }: { r: LoansReport }) {
  const empty = r.byCurrency.every((c) => !c.receivable.count && !c.payable.count && !c.interestCollectedMinor && !c.interestPaidMinor);
  if (empty) return <NoData text="Aún no hay préstamos ni deudas registrados." />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {r.byCurrency.map((c) => (
        <Cur key={c.currency} c={c.currency}>
          <table className="w-full">
            <caption className="sr-only">Préstamos y deudas en {c.currency}</caption>
            <Head cols={["Concepto", "Cantidad", "Monto"]} />
            <tbody>
              {([
                ["Pendiente por cobrar", c.receivable.count, c.receivable.outstandingMinor], ["Pendiente por pagar", c.payable.count, c.payable.outstandingMinor],
                ["Vencido por cobrar", c.overdueReceivable.count, c.overdueReceivable.outstandingMinor], ["Vencido por pagar", c.overduePayable.count, c.overduePayable.outstandingMinor],
              ] as const).map(([l, n, m]) => (
                <tr key={l} className="border-t border-border"><th scope="row" className="py-1 pr-3 text-left font-normal">{l}</th><td className="py-1 pr-3 text-right">{n}</td><td className="py-1 pr-3 text-right">{formatMoney(m, c.currency)}</td></tr>
              ))}
              <tr className="border-t border-border"><th scope="row" className="py-1 pr-3 text-left font-normal">Interés cobrado (período)</th><td className="py-1 pr-3 text-right">—</td><td className="py-1 pr-3 text-right text-positive">{formatMoney(c.interestCollectedMinor, c.currency)}</td></tr>
              <tr className="border-t border-border"><th scope="row" className="py-1 pr-3 text-left font-normal">Interés pagado (período)</th><td className="py-1 pr-3 text-right">—</td><td className="py-1 pr-3 text-right text-negative">{formatMoney(c.interestPaidMinor, c.currency)}</td></tr>
            </tbody>
          </table>
        </Cur>
      ))}
    </div>
  );
}

export function NetWorthSection({ r }: { r: NetWorthReport }) {
  return (
    <>
      <p className="mb-3 text-xs text-muted">Patrimonio neto al cierre de cada mes (últimos 12). Usa las cuentas, bienes y préstamos registrados hoy.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {CURRENCIES.map((c) => (
          <Cur key={c} c={c}>
            <Sparkline values={r.evolution.map((p) => p.byCurrency[c].net)} label={`Patrimonio neto en ${c} por mes`} />
            <ChartTable>
              <table className="w-full">
                <caption className="sr-only">Patrimonio neto en {c}</caption>
                <Head cols={["Al cierre de", "Neto"]} />
                <tbody>{r.evolution.map((p) => (
                  <tr key={p.date} className="border-t border-border"><th scope="row" className="py-1 pr-3 text-left font-normal">{fmtDate(p.date)}</th><td className="py-1 pr-3 text-right">{formatMoney(p.byCurrency[c].net, c)}</td></tr>
                ))}</tbody>
              </table>
            </ChartTable>
          </Cur>
        ))}
      </div>
    </>
  );
}

export function ComparisonSection({ r }: { r: PeriodComparison }) {
  return (
    <>
      <p className="mb-3 text-xs text-muted">
        A (base): {fmtDate(r.a.from)} a {fmtDate(r.a.to)} · B: {fmtDate(r.b.from)} a {fmtDate(r.b.to)}. Variación = B − A; el porcentaje es sobre A y se muestra «—» cuando A es cero.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {r.byCurrency.map((c) => (
          <Cur key={c.currency} c={c.currency}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">Comparación de períodos en {c.currency}</caption>
                <Head cols={["Métrica", "A", "B", "Variación", "%"]} />
                <tbody>
                  {([["Ingresos", c.income], ["Gastos", c.expense], ["Neto", c.net]] as const).map(([l, v]) => (
                    <tr key={l} className="border-t border-border">
                      <th scope="row" className="py-1 pr-3 text-left font-normal">{l}</th>
                      <td className="py-1 pr-3 text-right">{formatMoney(v.a, c.currency)}</td><td className="py-1 pr-3 text-right">{formatMoney(v.b, c.currency)}</td>
                      <td className="py-1 pr-3 text-right"><Money minor={v.absMinor} currency={c.currency} signed /></td><td className="py-1 pr-3 text-right"><Pct v={v} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cur>
        ))}
      </div>
    </>
  );
}
