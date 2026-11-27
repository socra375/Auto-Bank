import Link from "next/link";
import { MovementList } from "@/components/finance/movement-list";
import { fmtDate } from "@/lib/dates";
import { formatMoney, type Currency } from "@/lib/money";
import type { Overview } from "@/server/reports";
import { BarChart, bucketLabel, Legend, ShareBars } from "./charts";
import { ChartTable, Money, NoData, th } from "./parts";

const card = "rounded-xl border border-border bg-surface p-4";

function Kpi({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold">{children}</dd>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function OverviewView({ d }: { d: Overview }) {
  const hasAnything = d.recent.length > 0 || d.distribution.rows.length > 0 || d.due.length > 0;
  if (!hasAnything) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
        <h2 className="text-base font-semibold">Aún no hay datos</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">Crea una cuenta y registra tu primer movimiento para ver aquí tu resumen.</p>
        <Link href="/cuentas" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white">Ir a cuentas</Link>
      </div>
    );
  }
  return (
    <>
      <section aria-labelledby="ov-kpi" className="mb-6">
        <h2 id="ov-kpi" className="sr-only">Resumen por moneda</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {d.currencies.map((c) => {
            const f = d.flow.byCurrency.find((x) => x.currency === c)!;
            return (
              <div key={c} className={card}>
                <p className="mb-2 text-sm font-medium">{c}</p>
                <dl className="grid grid-cols-2 gap-3">
                  <Kpi label="Patrimonio neto"><Money minor={d.netWorth.byCurrency[c].net} currency={c} /></Kpi>
                  <Kpi label="Disponible" hint="Cuentas activas"><Money minor={d.disponible[c]} currency={c} /></Kpi>
                  <Kpi label="Por cobrar"><span className="text-positive">{formatMoney(d.loans.receivable[c], c)}</span></Kpi>
                  <Kpi label="Por pagar"><span className="text-negative">{formatMoney(d.loans.payable[c], c)}</span></Kpi>
                  <Kpi label="Ingresos del período"><span className="text-positive">{formatMoney(f.incomeMinor, c)}</span></Kpi>
                  <Kpi label="Gastos del período"><span className="text-negative">{formatMoney(f.expenseMinor, c)}</span></Kpi>
                </dl>
                <p className="mt-2 text-xs text-muted">Neto del período: <Money minor={f.netMinor} currency={c} signed /></p>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">
          Cada moneda se muestra por separado; DOP y USD nunca se suman. Disponible = saldo de las cuentas activas (efectivo, banco, ahorro y digital).
          Período: {fmtDate(d.period.from)} a {fmtDate(d.period.to)}.
        </p>
      </section>

      <section aria-labelledby="ov-flow" className="mb-6">
        <h2 id="ov-flow" className="mb-3 text-base font-semibold">Ingresos y gastos</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {d.flow.byCurrency.map((f) => (
            <div key={f.currency} className={card}>
              <h3 className="mb-2 text-sm font-medium">{f.currency}</h3>
              {f.series.length === 0 ? <NoData /> : (
                <>
                  <Legend items={[{ name: "Ingresos", tone: "positive" }, { name: "Gastos", tone: "negative", hatched: true }]} />
                  <BarChart id={`ov-${f.currency}`} currency={f.currency} categories={f.series.map((p) => bucketLabel(p.bucket, d.flow.granularity))}
                    ariaLabel={`Ingresos y gastos en ${f.currency}, del ${fmtDate(d.period.from)} al ${fmtDate(d.period.to)}`}
                    series={[{ name: "Ingresos", values: f.series.map((p) => p.incomeMinor), tone: "positive" }, { name: "Gastos", values: f.series.map((p) => p.expenseMinor), tone: "negative", hatched: true }]} />
                  <ChartTable>
                    <table className="w-full">
                      <caption className="sr-only">Ingresos y gastos en {f.currency}</caption>
                      <thead><tr className="text-xs text-muted"><th scope="col" className="py-1 pr-3 text-left font-medium">Período</th><th scope="col" className={th}>Ingresos</th><th scope="col" className={th}>Gastos</th><th scope="col" className={th}>Neto</th></tr></thead>
                      <tbody>
                        {f.series.map((p) => (
                          <tr key={p.bucket} className="border-t border-border">
                            <th scope="row" className="py-1 pr-3 text-left font-normal">{bucketLabel(p.bucket, d.flow.granularity)}</th>
                            <td className="py-1 pr-3 text-right">{formatMoney(p.incomeMinor, f.currency)}</td>
                            <td className="py-1 pr-3 text-right">{formatMoney(p.expenseMinor, f.currency)}</td>
                            <td className="py-1 pr-3 text-right"><Money minor={p.netMinor} currency={f.currency} signed /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ChartTable>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="ov-dist">
          <h2 id="ov-dist" className="mb-3 text-base font-semibold">Distribución del dinero por cuenta</h2>
          <div className="space-y-3">
            {d.currencies.map((c: Currency) => {
              const rows = d.distribution.rows.filter((r) => r.currency === c && r.status === "active" && r.balanceMinor > 0n);
              return (
                <div key={c} className={card}>
                  <h3 className="mb-2 text-sm font-medium">{c}</h3>
                  {rows.length === 0 ? <NoData text="Aún no hay cuentas con saldo en esta moneda." /> :
                    <ShareBars currency={c} items={rows.map((r) => ({ label: r.name, minor: r.balanceMinor, permille: r.shareOfActivePermille }))} />}
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="ov-due">
          <h2 id="ov-due" className="mb-3 text-base font-semibold">Próximos vencimientos (30 días)</h2>
          {d.due.length === 0 ? <NoData text="No hay préstamos vencidos ni por vencer pronto." /> : (
            <ul className="space-y-2">
              {d.due.map((l) => (
                <li key={l.id} className={`${card} flex items-start justify-between gap-3 text-sm`}>
                  <div className="min-w-0">
                    <Link href={`/prestamos/${l.id}`} className="font-medium text-primary underline-offset-2 hover:underline">{l.counterparty}</Link>
                    <p className="text-xs text-muted">
                      {l.direction === "receivable" ? "Por cobrar" : "Por pagar"} · {l.status === "vencido" ? "Vencido" : "Vence"} {fmtDate(l.dueDate!)}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-semibold">{formatMoney(l.outstandingMinor, l.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="ov-recent" className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="ov-recent" className="text-base font-semibold">Últimos movimientos</h2>
          <Link href="/movimientos" className="text-sm text-primary underline-offset-2 hover:underline">Ver todos</Link>
        </div>
        <MovementList items={d.recent} />
      </section>
    </>
  );
}
