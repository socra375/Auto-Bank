import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ASSET_TYPE_LABEL, ValuationChart } from "@/components/finance/assets";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/states/states";
import { ActionForm } from "@/components/ui/action-form";
import { Disclosure, Field, inputCls } from "@/components/ui/fields";
import { addValuationAction, disposeAssetAction, updateAssetAction } from "@/lib/actions/assets";
import { requireOwner } from "@/lib/auth/guard";
import { fmtDate, todayDR } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getAsset } from "@/server/assets";
import { getExecutor } from "@/server/db";
import { DomainError } from "@/server/errors";

export const metadata: Metadata = { title: "Detalle de bien" };

const ACTION_LABEL: Record<string, string> = {
  "asset.create": "Bien registrado", "asset.valuation": "Valoración registrada", "asset.update": "Datos editados", "asset.dispose": "Bien dado de baja",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireOwner();
  const { id } = await params;
  let d;
  try {
    d = await getAsset(getExecutor(), userId, id);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    console.error("asset detail failed", e);
    return <ErrorState title="No se pudo cargar el bien" description="Inténtalo de nuevo en unos segundos." />;
  }
  const { asset: a, valuations, history } = d;
  const formKey = crypto.randomUUID(); // idempotency key: new per rendered form
  const money = (n: bigint) => formatMoney(n, a.currency);
  const disposed = a.status === "disposed";
  const chartPoints = [...valuations].reverse(); // oldest first

  return (
    <>
      <PageHeader title={a.name} description={`${ASSET_TYPE_LABEL[a.type]} · ${a.currency}${disposed ? ` · De baja el ${a.disposedOn ? fmtDate(a.disposedOn) : ""}` : ""}`} />
      <div className="mb-4 text-sm"><Link href="/patrimonio" className="text-primary underline">← Volver a patrimonio</Link></div>

      <section aria-labelledby="resumen" className="mb-6 rounded-xl border border-border bg-surface p-4">
        <h2 id="resumen" className="mb-3 text-base font-semibold">Resumen</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted">Valor actual</dt><dd className="font-semibold">{a.currentValueMinor === null ? "—" : money(a.currentValueMinor)}</dd></div>
          <div><dt className="text-xs text-muted">Valorado el</dt><dd>{a.currentValuedOn ? fmtDate(a.currentValuedOn) : "—"}</dd></div>
          <div><dt className="text-xs text-muted">Costo de adquisición</dt><dd>{a.acquisitionCostMinor === null ? "—" : money(a.acquisitionCostMinor)}</dd></div>
          <div><dt className="text-xs text-muted">Adquirido el</dt><dd>{a.acquiredOn ? fmtDate(a.acquiredOn) : "—"}</dd></div>
        </dl>
        {a.description && <p className="mt-3 text-sm text-muted">{a.description}</p>}
        {disposed && <p className="mt-3 text-sm text-muted">Este bien no cuenta en el patrimonio. Su historial de valoraciones se conserva.</p>}
      </section>

      {!disposed && (
        <section className="mb-6 space-y-3">
          <Disclosure summary="Registrar nueva valoración">
            <ActionForm action={addValuationAction.bind(null, id)} submit="Registrar valoración" resetOnSuccess>
              <input type="hidden" name="idempotencyKey" value={formKey} />
              <p className="text-xs text-muted">No se modifica ninguna valoración anterior: se agrega una nueva. Puedes registrar una fecha pasada; el valor actual es el de la fecha más reciente.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`Valor (${a.currency})`} id="va-value"><input id="va-value" name="value" required inputMode="decimal" placeholder="0.00" className={inputCls} /></Field>
                <Field label="Fecha de valoración" id="va-date"><input id="va-date" name="valuedOn" type="date" required max={todayDR()} defaultValue={todayDR()} className={inputCls} /></Field>
                <Field label="Fuente (opcional)" id="va-source"><input id="va-source" name="source" maxLength={100} placeholder="tasación, estimado propio…" className={inputCls} /></Field>
                <Field label="Nota (opcional)" id="va-note"><input id="va-note" name="note" maxLength={1000} className={inputCls} /></Field>
              </div>
            </ActionForm>
          </Disclosure>
          <Disclosure summary="Editar nombre y descripción">
            <ActionForm action={updateAssetAction.bind(null, id)} submit="Guardar">
              <Field label="Nombre" id="ed-name"><input id="ed-name" name="name" required maxLength={120} defaultValue={a.name} className={inputCls} /></Field>
              <Field label="Descripción" id="ed-desc"><textarea id="ed-desc" name="description" rows={2} maxLength={1000} defaultValue={a.description ?? ""} className={inputCls} /></Field>
            </ActionForm>
          </Disclosure>
          <Disclosure summary="Dar de baja">
            <ActionForm action={disposeAssetAction.bind(null, id)} submit="Dar de baja" variant="danger">
              <p className="text-xs text-muted">El bien sale del patrimonio desde esa fecha; no se elimina y su historial se conserva.</p>
              <Field label="Fecha de baja" id="di-date"><input id="di-date" name="disposedOn" type="date" required max={todayDR()} defaultValue={todayDR()} className={inputCls} /></Field>
              <Field label="Motivo (opcional)" id="di-note"><input id="di-note" name="note" maxLength={1000} className={inputCls} /></Field>
            </ActionForm>
          </Disclosure>
        </section>
      )}

      <section aria-labelledby="vals" className="mb-6 rounded-xl border border-border bg-surface p-4">
        <h2 id="vals" className="mb-3 text-base font-semibold">Historial de valoraciones</h2>
        <ValuationChart points={chartPoints} currency={a.currency} />
        <ul className="divide-y divide-border text-sm">
          {valuations.map((v, i) => (
            <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span>{fmtDate(v.valuedOn)}{i === 0 ? " · actual" : ""}{v.source ? ` · ${v.source}` : ""}{v.note ? ` · ${v.note}` : ""}</span>
              <span className="font-semibold">{money(v.valueMinor)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hist" className="rounded-xl border border-border bg-surface p-4">
        <h2 id="hist" className="mb-3 text-base font-semibold">Historial de modificaciones</h2>
        <ol className="space-y-2 text-sm">
          {history.map((h) => (
            <li key={h.id}>
              <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
              <span className="text-muted"> · {h.createdAt.slice(0, 16).replace("T", " ")}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
