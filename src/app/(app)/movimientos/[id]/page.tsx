import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/states/states";
import { PageHeader } from "@/components/shell/page-header";
import { MovementForm } from "@/components/finance/movement-form";
import { statusLabel, toInitial, TYPE_LABEL } from "@/components/finance/format";
import { ActionForm } from "@/components/ui/action-form";
import { Disclosure, Field, inputCls } from "@/components/ui/fields";
import { correctMovementAction, updateMovementMetaAction, voidMovementAction } from "@/lib/actions/movements";
import { requireOwner } from "@/lib/auth/guard";
import { fmtDate, todayDR } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { listAccounts } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { getExecutor } from "@/server/db";
import { DomainError } from "@/server/errors";
import { getMovement, type AuditEntry, type MovementRow } from "@/server/ledger";

export const metadata: Metadata = { title: "Detalle de movimiento" };

const ACTION_LABEL: Record<string, string> = {
  "txn.create": "Creado", "txn.update": "Descripción/notas/categoría editadas", "txn.reverse": "Reversa generada",
  "txn.void": "Anulado", "txn.correct": "Corregido (reversa + nuevo movimiento)",
};

const Link2 = ({ m, label }: { m: MovementRow | null; label: string }) =>
  m ? <li>{label}: <Link href={`/movimientos/${m.id}`} className="text-primary underline">{m.description} ({fmtDate(m.date)})</Link></li> : null;

function historyDetail(h: AuditEntry) {
  if (h.action !== "txn.update") return null;
  const b = (h.before ?? {}) as Record<string, unknown>;
  const a = (h.after ?? {}) as Record<string, unknown>;
  const changed = ["description", "notes", "categoryId"].filter((k) => b[k] !== a[k]);
  return changed.length ? `Cambió: ${changed.map((k) => ({ description: "descripción", notes: "notas", categoryId: "categoría" })[k]).join(", ")}` : null;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireOwner();
  const { id } = await params;
  const ex = getExecutor();
  let m;
  try {
    m = await getMovement(ex, userId, id);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    console.error("movement detail failed", e);
    return <ErrorState title="No se pudo cargar el movimiento" description="Inténtalo de nuevo en unos segundos." />;
  }
  const [accounts, categories] = await Promise.all([listAccounts(ex, userId), listCategories(ex, userId)]);
  const initial = m.status === "posted" ? toInitial(m) : null;
  const catKind = m.type === "income" || m.type === "expense" ? m.type : null;

  return (
    <>
      <PageHeader title={m.description} description={`${TYPE_LABEL[m.type] ?? m.type} · ${fmtDate(m.date)} · ${statusLabel(m)}`} />
      <Link href="/movimientos" className="mb-4 inline-block text-sm text-primary underline">← Volver a movimientos</Link>

      <section aria-labelledby="legs" className="mb-6 card">
        <h2 id="legs" className="mb-3 section-title">Detalle contable</h2>
        <ul className="divide-y divide-border text-sm">
          {m.legs.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{l.accountName} <span className="text-muted">({l.currency})</span></span>
              <span className={`font-medium ${l.amountMinor >= 0n ? "text-positive" : "text-negative"}`}>{formatMoney(l.amountMinor, l.currency)}</span>
            </li>
          ))}
        </ul>
        {m.categoryName && <p className="mt-2 text-sm text-muted">Categoría: {m.categoryName}</p>}
        {m.fxRate && <p className="mt-1 text-sm text-muted">Tasa de cambio aplicada: {m.fxRate}</p>}
        {m.notes && <p className="mt-1 text-sm text-muted">Notas: {m.notes}</p>}
        <ul className="mt-2 space-y-1 text-sm">
          <Link2 m={m.reverses} label="Anula a" />
          <Link2 m={m.reversal} label="Anulado por" />
          <Link2 m={m.replacedBy} label="Reemplazado por" />
        </ul>
      </section>

      {m.type !== "reversal" && (
        <div className="mb-6 space-y-3">
          <Disclosure summary="Editar descripción, notas o categoría">
            <ActionForm action={updateMovementMetaAction.bind(null, id)} submit="Guardar cambios">
              <Field label="Descripción" id="meta-description">
                <input id="meta-description" name="description" required maxLength={200} defaultValue={m.description} className={inputCls} />
              </Field>
              {catKind && m.status === "posted" && (
                <Field label="Categoría" id="meta-category">
                  <select id="meta-category" name="categoryId" defaultValue={m.categoryId ?? ""} className={inputCls}>
                    {categories.filter((c) => c.kind === catKind && (c.status === "active" || c.id === m.categoryId)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Notas" id="meta-notes">
                <textarea id="meta-notes" name="notes" rows={2} maxLength={1000} defaultValue={m.notes ?? ""} className={inputCls} />
              </Field>
            </ActionForm>
          </Disclosure>

          {m.status === "posted" && initial && (
            <>
              <Disclosure summary="Corregir monto, cuenta, fecha o tipo">
                <p className="mb-3 text-sm text-muted">
                  Para conservar el historial, se genera una reversa exacta del movimiento original y se registra uno nuevo con los datos corregidos.
                </p>
                <MovementForm
                  idp="fix" action={correctMovementAction.bind(null, id)} today={todayDR()} initial={initial} submit="Corregir movimiento"
                  accounts={accounts.filter((a) => a.status === "active").map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
                  categories={categories.filter((c) => c.status === "active").map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
                />
              </Disclosure>
              <Disclosure summary="Anular movimiento">
                <p className="mb-3 text-sm text-muted">Se genera una reversa exacta; el movimiento permanece en el historial como anulado.</p>
                <ActionForm action={voidMovementAction.bind(null, id)} submit="Anular movimiento" variant="danger">
                  <Field label="Motivo (opcional)" id="void-reason">
                    <input id="void-reason" name="reason" maxLength={300} className={inputCls} />
                  </Field>
                </ActionForm>
              </Disclosure>
            </>
          )}
        </div>
      )}

      <section aria-labelledby="history" className="card">
        <h2 id="history" className="mb-3 section-title">Historial de modificaciones</h2>
        <ol className="space-y-2 text-sm">
          {m.history.map((h) => (
            <li key={h.id}>
              <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
              <span className="text-muted"> · {h.createdAt.slice(0, 16).replace("T", " ")}</span>
              {historyDetail(h) && <span className="text-muted"> · {historyDetail(h)}</span>}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
