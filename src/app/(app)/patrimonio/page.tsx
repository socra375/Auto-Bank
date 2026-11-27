import type { Metadata } from "next";
import Link from "next/link";
import type { SearchParams } from "@/components/finance/filters";
import { AssetCard, ASSET_TYPE_LABEL, ASSET_TYPE_ORDER, NetWorthPanel, Sparkline } from "@/components/finance/assets";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, ErrorState } from "@/components/states/states";
import { ActionForm } from "@/components/ui/action-form";
import { CURRENCY_OPTIONS, Disclosure, Field, inputCls, Options } from "@/components/ui/fields";
import { createAssetAction } from "@/lib/actions/assets";
import { requireOwner } from "@/lib/auth/guard";
import { fmtDate, todayDR } from "@/lib/dates";
import { CURRENCIES, formatMoney, isCurrency } from "@/lib/money";
import { safe } from "@/lib/safe";
import { listAssets, netWorth, netWorthEvolution } from "@/server/assets";
import { getExecutor } from "@/server/db";
import { assetFiltersSchema } from "@/server/schemas";

export const metadata: Metadata = { title: "Patrimonio" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const userId = await requireOwner();
  const sp = await searchParams;
  const baseRaw = first(sp.base);
  const base = baseRaw && isCurrency(baseRaw) ? baseRaw : undefined;
  const parsed = assetFiltersSchema.safeParse({ type: first(sp.tipo), status: first(sp.estado), currency: first(sp.moneda) });
  const filters = parsed.success ? parsed.data : {};
  const ex = getExecutor();

  const res = await safe(Promise.all([
    listAssets(ex, userId, filters), netWorth(ex, userId, { baseCurrency: base }), netWorthEvolution(ex, userId, 12),
  ]));
  if (res.failed) {
    return (<><PageHeader title="Patrimonio" /><ErrorState title="No se pudo cargar el patrimonio" description="Inténtalo de nuevo en unos segundos." /></>);
  }
  const [assets, nw, evolution] = res.data;
  const formKey = crypto.randomUUID(); // idempotency key: new per rendered form
  const v = (k: string) => first(sp[k]) ?? "";
  const keep = (b?: string) => `/patrimonio${b ? `?base=${b}` : ""}`;

  return (
    <>
      <PageHeader title="Patrimonio" description="Bienes con historial de valoraciones y patrimonio neto. Cada moneda se totaliza por separado; DOP y USD nunca se suman." />

      <nav aria-label="Moneda de consolidación" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Consolidar en:</span>
        {[["", "Sin consolidar"], ...CURRENCIES.map((c) => [c, c])].map(([b, label]) => (
          <Link key={b} href={keep(b)} aria-current={(base ?? "") === b ? "page" : undefined}
            className="pill">{label}</Link>
        ))}
      </nav>

      <NetWorthPanel nw={nw} />

      <section aria-labelledby="evo" className="card mb-8">
        <h2 id="evo" className="mb-1 section-title">Evolución del patrimonio neto (12 meses)</h2>
        <p className="mb-3 text-xs text-muted">
          Calculado al cierre de cada mes con movimientos, valoraciones y préstamos fechados hasta ese día. Usa las cuentas y bienes registrados hoy;
          las cuentas archivadas siguen contando mientras tengan saldo.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {CURRENCIES.map((c) => <Sparkline key={c} values={evolution.map((p) => p.byCurrency[c].net)} label={`Patrimonio neto en ${c} por mes`} />)}
        </div>
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla de evolución del patrimonio neto">
          <table className="data-table compact">
            <caption className="sr-only">Patrimonio neto al cierre de cada mes, por moneda</caption>
            <thead><tr><th scope="col">Al cierre de</th>{CURRENCIES.map((c) => <th key={c} scope="col" className="num">Neto {c}</th>)}</tr></thead>
            <tbody>
              {evolution.map((p) => (
                <tr key={p.date}>
                  <th scope="row">{fmtDate(p.date)}</th>
                  {CURRENCIES.map((c) => <td key={c} className="num">{formatMoney(p.byCurrency[c].net, c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Disclosure summary="Nuevo bien" className="mb-6">
        <ActionForm action={createAssetAction} submit="Registrar" resetOnSuccess>
          <input type="hidden" name="idempotencyKey" value={formKey} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" id="as-name"><input id="as-name" name="name" required maxLength={120} className={inputCls} /></Field>
            <Field label="Categoría" id="as-type">
              <select id="as-type" name="type" required defaultValue="other" className={inputCls}>
                <Options items={ASSET_TYPE_ORDER.map((t) => ({ value: t, label: ASSET_TYPE_LABEL[t] }))} />
              </select>
            </Field>
            <Field label="Moneda" id="as-currency" hint="No se puede cambiar después.">
              <select id="as-currency" name="currency" required defaultValue="DOP" aria-describedby="as-currency-hint" className={inputCls}><Options items={CURRENCY_OPTIONS} /></select>
            </Field>
            <Field label="Valor actual" id="as-value"><input id="as-value" name="initialValue" required inputMode="decimal" placeholder="0.00" className={inputCls} /></Field>
            <Field label="Fecha de valoración" id="as-valued"><input id="as-valued" name="valuedOn" type="date" required max={todayDR()} defaultValue={todayDR()} className={inputCls} /></Field>
            <Field label="Fecha de adquisición (opcional)" id="as-acq"><input id="as-acq" name="acquiredOn" type="date" className={inputCls} /></Field>
            <Field label="Costo de adquisición (opcional)" id="as-cost"><input id="as-cost" name="acquisitionCost" inputMode="decimal" placeholder="0.00" className={inputCls} /></Field>
          </div>
          <Field label="Descripción (opcional)" id="as-desc"><textarea id="as-desc" name="description" rows={2} maxLength={1000} className={inputCls} /></Field>
        </ActionForm>
      </Disclosure>

      <form method="get" action="/patrimonio" className="mb-4 grid gap-3 card sm:grid-cols-4">
        {base && <input type="hidden" name="base" value={base} />}
        <Field label="Categoría" id="af-tipo">
          <select id="af-tipo" name="tipo" defaultValue={v("tipo")} className={inputCls}>
            <Options placeholder="Todas" items={ASSET_TYPE_ORDER.map((t) => ({ value: t, label: ASSET_TYPE_LABEL[t] }))} />
          </select>
        </Field>
        <Field label="Estado" id="af-estado">
          <select id="af-estado" name="estado" defaultValue={v("estado")} className={inputCls}>
            <Options placeholder="Todos" items={[{ value: "active", label: "Activos" }, { value: "disposed", label: "De baja" }]} />
          </select>
        </Field>
        <Field label="Moneda" id="af-moneda">
          <select id="af-moneda" name="moneda" defaultValue={v("moneda")} className={inputCls}><Options placeholder="Todas" items={CURRENCIES.map((c) => ({ value: c, label: c }))} /></select>
        </Field>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn btn-primary">Filtrar</button>
          <Link href={keep(base)} className="btn btn-secondary">Limpiar</Link>
        </div>
      </form>

      {assets.length === 0 ? (
        <EmptyState title="No hay bienes" description="Registra uno con «Nuevo bien», o ajusta los filtros." />
      ) : (
        ASSET_TYPE_ORDER.map((t) => {
          const group = assets.filter((a) => a.type === t);
          return group.length === 0 ? null : (
            <section key={t} aria-labelledby={`g-${t}`} className="mb-6">
              <h2 id={`g-${t}`} className="mb-3 section-title">{ASSET_TYPE_LABEL[t]}</h2>
              <ul className="grid gap-4 lg:grid-cols-2">{group.map((a) => <AssetCard key={a.id} a={a} />)}</ul>
            </section>
          );
        })
      )}
    </>
  );
}
