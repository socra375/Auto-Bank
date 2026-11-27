import Link from "next/link";
import { EmptyState } from "@/components/states/states";
import { MovementList } from "@/components/finance/movement-list";
import { fmtDate } from "@/lib/dates";
import { formatMoney, type Currency } from "@/lib/money";
import type { Overview } from "@/server/reports";
import { BarChart, bucketLabel, Legend, ShareBars } from "./charts";
import { ArrowDownLeft, ArrowUpRight, Landmark, Minus, TrendingDown, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { ChartTable, Money, NoData, th, tone } from "./parts";

const card = "card";

function Kpi({ label, children, hint, icon: Icon, tone }: { label: string; children: React.ReactNode; hint?: string; icon?: LucideIcon; tone?: "pos" | "neg" }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 p-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {Icon && <Icon className={`size-3.5 shrink-0 ${tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : ""}`} aria-hidden />}{label}
      </dt>
      <dd className="amount mt-1 text-[0.9375rem] sm:text-base">{children}</dd>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function NetDelta({ minor, currency }: { minor: bigint; currency: Currency }) {
  const Icon = minor > 0n ? TrendingUp : minor < 0n ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${tone(minor)}`}>
      <Icon className="size-4" aria-hidden /><Money minor={minor} currency={currency} signed />
    </span>
  );
}

export function OverviewView({ d }: { d: Overview }) {
  const hasAnything = d.recent.length > 0 || d.distribution.rows.length > 0 || d.due.length > 0;
  if (!hasAnything) {
    return (
      <EmptyState title="Aún no hay datos" description="Crea una cuenta y registra tu primer movimiento para ver aquí tu resumen."
        action={<Link href="/cuentas" className="btn btn-primary">Ir a cuentas</Link>} />
    );
  }
  return (
    <>
      <section aria-labelledby="ov-kpi" className="mb-8">
        <h2 id="ov-kpi" className="sr-only">Resumen por moneda</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {d.currencies.map((c) => {
            const f = d.flow.byCurrency.find((x) => x.currency === c)!;
            return (
              <article key={c} className={card} aria-label={`Resumen en ${c}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">Patrimonio neto</p>
                    <p className="amount-xl mt-1"><Money minor={d.netWorth.byCurrency[c].net} currency={c} /></p>
                  </div>
                  <span className="badge badge-info">{c}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4 text-sm">
                  <span className="inline-flex items-center gap-1.5 text-muted"><Wallet className="size-4" aria-hidden />Disponible (cuentas activas)</span>
                  <span className="amount"><Money minor={d.disponible[c]} currency={c} /></span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <Kpi label="Por cobrar" icon={ArrowDownLeft} tone="pos"><span className="pos">{formatMoney(d.loans.receivable[c], c)}</span></Kpi>
                  <Kpi label="Por pagar" icon={ArrowUpRight} tone="neg"><span className="neg">{formatMoney(d.loans.payable[c], c)}</span></Kpi>
                  <Kpi label="Ingresos del período" icon={TrendingUp} tone="pos"><span className="pos">+{formatMoney(f.incomeMinor, c)}</span></Kpi>
                  <Kpi label="Gastos del período" icon={TrendingDown} tone="neg"><span className="neg">-{formatMoney(f.expenseMinor, c)}</span></Kpi>
                </dl>
                <p className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm text-muted">
                  <span className="inline-flex items-center gap-1.5"><Landmark className="size-4" aria-hidden />Neto del período</span>
                  <NetDelta minor={f.netMinor} currency={c} />
                </p>
              </article>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted [text-wrap:pretty]">
          Cada moneda se muestra por separado; DOP y USD nunca se suman. Disponible = saldo de las cuentas activas (efectivo, banco, ahorro y digital).
          Período: {fmtDate(d.period.from)} a {fmtDate(d.period.to)}.
        </p>
      </section>

      <section aria-labelledby="ov-flow" className="mb-8">
        <h2 id="ov-flow" className="section-title mb-3">Ingresos y gastos</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {d.flow.byCurrency.map((f) => (
            <div key={f.currency} className={card}>
              <h3 className="mb-3"><span className="badge badge-info">{f.currency}</span></h3>
              {f.series.length === 0 ? <NoData /> : (
                <>
                  <Legend items={[{ name: "Ingresos", tone: "positive" }, { name: "Gastos", tone: "negative", hatched: true }]} />
                  <BarChart id={`ov-${f.currency}`} currency={f.currency} categories={f.series.map((p) => bucketLabel(p.bucket, d.flow.granularity))}
                    ariaLabel={`Ingresos y gastos en ${f.currency}, del ${fmtDate(d.period.from)} al ${fmtDate(d.period.to)}`}
                    series={[{ name: "Ingresos", values: f.series.map((p) => p.incomeMinor), tone: "positive" }, { name: "Gastos", values: f.series.map((p) => p.expenseMinor), tone: "negative", hatched: true }]} />
                  <ChartTable>
                    <table className="data-table compact">
                      <caption className="sr-only">Ingresos y gastos en {f.currency}</caption>
                      <thead><tr><th scope="col">Período</th><th scope="col" className={th}>Ingresos</th><th scope="col" className={th}>Gastos</th><th scope="col" className={th}>Neto</th></tr></thead>
                      <tbody>
                        {f.series.map((p) => (
                          <tr key={p.bucket}>
                            <th scope="row">{bucketLabel(p.bucket, d.flow.granularity)}</th>
                            <td className="num">{formatMoney(p.incomeMinor, f.currency)}</td>
                            <td className="num">{formatMoney(p.expenseMinor, f.currency)}</td>
                            <td className="num"><Money minor={p.netMinor} currency={f.currency} signed /></td>
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

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="ov-dist">
          <h2 id="ov-dist" className="section-title mb-3">Distribución del dinero por cuenta</h2>
          <div className="space-y-4">
            {d.currencies.map((c: Currency) => {
              const rows = d.distribution.rows.filter((r) => r.currency === c && r.status === "active" && r.balanceMinor > 0n);
              return (
                <div key={c} className={card}>
                  <h3 className="mb-3"><span className="badge badge-info">{c}</span></h3>
                  {rows.length === 0 ? <NoData text="Aún no hay cuentas con saldo en esta moneda." /> :
                    <ShareBars currency={c} items={rows.map((r) => ({ label: r.name, minor: r.balanceMinor, permille: r.shareOfActivePermille }))} />}
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="ov-due">
          <h2 id="ov-due" className="section-title mb-3">Próximos vencimientos (30 días)</h2>
          {d.due.length === 0 ? <NoData text="No hay préstamos vencidos ni por vencer pronto." /> : (
            <ul className="space-y-3">
              {d.due.map((l) => (
                <li key={l.id} className={`${card} flex items-start justify-between gap-3 text-sm !p-4`}>
                  <div className="min-w-0">
                    <Link href={`/prestamos/${l.id}`} className="font-semibold text-primary underline-offset-2 hover:underline">{l.counterparty}</Link>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className={`badge ${l.status === "vencido" ? "badge-negative" : "badge-neutral"}`}>{l.status === "vencido" ? "Vencido" : "Por vencer"}</span>
                      {l.direction === "receivable" ? "Por cobrar" : "Por pagar"} · {fmtDate(l.dueDate!)}
                    </p>
                  </div>
                  <span className={`amount ${l.direction === "receivable" ? "pos" : "neg"}`}>{formatMoney(l.outstandingMinor, l.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="ov-recent" className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="ov-recent" className="section-title">Últimos movimientos</h2>
          <Link href="/movimientos" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-2 hover:underline">Ver todos</Link>
        </div>
        <MovementList items={d.recent} />
      </section>
    </>
  );
}
