import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, ErrorState } from "@/components/states/states";
import { ActionForm } from "@/components/ui/action-form";
import { CURRENCY_OPTIONS, Field, inputCls, Options } from "@/components/ui/fields";
import { saveRateAction } from "@/lib/actions/rates";
import { requireOwner } from "@/lib/auth/guard";
import { fmtDate, todayDR } from "@/lib/dates";
import { safe } from "@/lib/safe";
import { getExecutor } from "@/server/db";
import { listRates } from "@/server/fx";

export const metadata: Metadata = { title: "Configuración" };

export default async function Page() {
  const userId = await requireOwner();
  const res = await safe(listRates(getExecutor(), userId));
  return (
    <>
      <PageHeader title="Configuración" description="Tipos de cambio registrados manualmente. Si falta una tasa, los consolidados muestran «Sin tipo de cambio registrado»; nunca se estima." />
      <section aria-labelledby="rates" className="rounded-xl border border-border bg-surface p-4">
        <h2 id="rates" className="mb-3 text-base font-semibold">Tipos de cambio</h2>
        <ActionForm action={saveRateAction} submit="Guardar tasa" className="mb-6">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Moneda base (1 unidad)" id="rate-base">
              <select id="rate-base" name="base" defaultValue="USD" className={inputCls}><Options items={CURRENCY_OPTIONS} /></select>
            </Field>
            <Field label="Moneda cotizada" id="rate-quote">
              <select id="rate-quote" name="quote" defaultValue="DOP" className={inputCls}><Options items={CURRENCY_OPTIONS} /></select>
            </Field>
            <Field label="Tasa" id="rate-rate" hint="Ej.: 1 USD = 59.25 DOP">
              <input id="rate-rate" name="rate" required inputMode="decimal" placeholder="59.250000" aria-describedby="rate-rate-hint" className={inputCls} />
            </Field>
            <Field label="Vigente desde" id="rate-date"><input id="rate-date" name="date" type="date" required defaultValue={todayDR()} className={inputCls} /></Field>
          </div>
        </ActionForm>
        {res.failed ? (
          <ErrorState title="No se pudieron cargar las tasas" />
        ) : res.data.length === 0 ? (
          <EmptyState title="Sin tipos de cambio" description="Registra una tasa para ver totales consolidados." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Historial de tipos de cambio</caption>
              <thead className="border-b border-border text-muted">
                <tr><th scope="col" className="py-2 font-medium">Vigente desde</th><th scope="col" className="py-2 font-medium">Par</th><th scope="col" className="py-2 text-right font-medium">Tasa</th><th scope="col" className="py-2 font-medium pl-4">Fuente</th></tr>
              </thead>
              <tbody>
                {res.data.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2">{fmtDate(r.date)}</td>
                    <td className="py-2">1 {r.base} = {r.quote}</td>
                    <td className="py-2 text-right">{r.rate}</td>
                    <td className="py-2 pl-4">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
