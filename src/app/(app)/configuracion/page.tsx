import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ThemePicker } from "@/components/ui/theme-picker";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
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
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <>
      <PageHeader title="Configuración" description="Preferencias visuales y tipos de cambio registrados manualmente. Si falta una tasa, los consolidados muestran «Sin tipo de cambio registrado»; nunca se estima." />
      <section aria-labelledby="visual" className="card mb-6">
        <h2 id="visual" className="section-title mb-1">Preferencias visuales</h2>
        <p className="mb-4 text-sm text-muted">El tema se guarda en este navegador.</p>
        <ThemePicker initial={theme} />
      </section>
      <section aria-labelledby="rates" className="card">
        <h2 id="rates" className="section-title mb-4">Tipos de cambio</h2>
        <ActionForm action={saveRateAction} submit="Guardar tasa" className="mb-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Historial de tipos de cambio">
            <table className="data-table">
              <caption className="sr-only">Historial de tipos de cambio</caption>
              <thead>
                <tr><th scope="col">Vigente desde</th><th scope="col">Par</th><th scope="col" className="num">Tasa</th><th scope="col">Fuente</th></tr>
              </thead>
              <tbody>
                {res.data.map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date)}</td>
                    <td>1 {r.base} = {r.quote}</td>
                    <td className="num">{r.rate}</td>
                    <td>{r.source}</td>
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
