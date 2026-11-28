import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TYPE_LABEL } from "@/components/finance/format";
import { RemoveLoanButton, StatusBadge } from "@/components/finance/loans";
import { ConfirmActionDialog } from "@/components/ui/confirm-dialog";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/states/states";
import { ActionForm } from "@/components/ui/action-form";
import { Disclosure, Field, inputCls } from "@/components/ui/fields";
import { registerPaymentAction, removeLoanAction, voidPaymentAction } from "@/lib/actions/loans";
import { requireOwner } from "@/lib/auth/guard";
import { fmtDate, todayDR } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { listAccounts } from "@/server/accounts";
import { getExecutor } from "@/server/db";
import { DomainError } from "@/server/errors";
import { getLoan } from "@/server/loans";

export const metadata: Metadata = { title: "Detalle de préstamo" };

const ACTION_LABEL: Record<string, string> = {
  "loan.create": "Préstamo registrado", "loan.payment": "Pago registrado", "loan.payment_void": "Pago anulado", "loan.origin_void": "Desembolso inicial anulado", "loan.cancel": "Préstamo cancelado (eliminado)",
};

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ eliminado?: string | string[] }> }) {
  const userId = await requireOwner();
  const { id } = await params;
  const removedPayment = !!(await searchParams).eliminado;
  const ex = getExecutor();
  let d;
  try {
    d = await getLoan(ex, userId, id);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    console.error("loan detail failed", e);
    return <ErrorState title="No se pudo cargar el préstamo" description="Inténtalo de nuevo en unos segundos." />;
  }
  const { loan: l, movements, history } = d;
  const accounts = (await listAccounts(ex, userId)).filter((a) => a.status === "active" && a.currency === l.currency);
  const receivable = l.direction === "receivable";
  const activePayments = movements.some((m) => m.status === "posted" && (m.type === "loan_collection" || m.type === "loan_repayment"));
  const cancelled = l.status === "cancelado";
  const formKey = crypto.randomUUID(); // idempotency key: new per rendered form
  const money = (n: bigint) => formatMoney(n, l.currency);

  return (
    <>
      <PageHeader title={l.counterparty} description={`${receivable ? "Me debe" : "Le debo"} · ${l.currency} · desde ${fmtDate(l.startDate)}${l.dueDate ? ` · vence ${fmtDate(l.dueDate)}` : ""}`} />
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <Link href="/prestamos" className="text-primary underline">← Volver a préstamos</Link>
        <Link href={`/prestamos?persona=${encodeURIComponent(l.counterparty)}`} className="text-primary underline">Historial con {l.counterparty}</Link>
      </div>

      <section aria-labelledby="resumen" className="mb-6 card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="resumen" className="section-title">Resumen</h2>
          <StatusBadge status={l.status} />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted">Capital original</dt><dd className="font-semibold">{money(l.principalMinor)}</dd></div>
          <div><dt className="text-xs text-muted">Capital {receivable ? "cobrado" : "pagado"}</dt><dd>{money(l.principalPaidMinor)}</dd></div>
          <div><dt className="text-xs text-muted">Pendiente</dt><dd className="font-semibold">{money(l.outstandingMinor)}</dd></div>
          <div><dt className="text-xs text-muted">Interés {receivable ? "cobrado" : "pagado"}</dt><dd>{money(l.interestPaidMinor)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          {l.funded ? `Movimiento de dinero registrado en ${l.accountName ?? "la cuenta"}.` : "Deuda existente: no movió dinero de tus cuentas."}
          {l.interestRatePct ? ` Tasa anual informativa: ${l.interestRatePct}%.` : ""}
        </p>
        {l.notes && <p className="mt-1 text-sm text-muted">Notas: {l.notes}</p>}
      </section>

      {cancelled && <p className="mb-6 card text-sm text-muted">Préstamo cancelado: no cuenta en tus totales ni admite nuevos pagos.</p>}
      {removedPayment && (
        <p role="status" className="feedback mb-6 flex items-start gap-2 rounded-lg bg-positive-soft px-3 py-2.5 text-sm text-positive">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><span>Pago eliminado (anulado). El saldo pendiente se restauró.</span>
        </p>
      )}
      {!cancelled && (
        <section aria-label="Acciones del préstamo" className="mb-6 flex flex-wrap items-center gap-3">
          <RemoveLoanButton l={l} action={removeLoanAction.bind(null, id)} />
          {activePayments && <p className="text-sm text-muted">Para eliminar el préstamo, primero elimina sus pagos (abajo).</p>}
        </section>
      )}

      {!cancelled && <section className="mb-6">
        <Disclosure summary={receivable ? "Registrar cobro" : "Registrar pago"}>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted">Necesitas una cuenta activa en {l.currency} para registrar pagos.</p>
          ) : (
            <ActionForm action={registerPaymentAction.bind(null, id)} submit={receivable ? "Registrar cobro" : "Registrar pago"} resetOnSuccess>
              <input type="hidden" name="idempotencyKey" value={formKey} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`Cuenta (${l.currency})`} id="pg-account">
                  <select id="pg-account" name="accountId" required defaultValue={l.accountId && accounts.some((a) => a.id === l.accountId) ? l.accountId : accounts[0].id} className={inputCls}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </Field>
                <Field label="Fecha" id="pg-date"><input id="pg-date" name="date" type="date" required min={l.startDate} defaultValue={todayDR()} className={inputCls} /></Field>
                <Field label="Capital" id="pg-principal" hint={`Máximo ${money(l.outstandingMinor)}. Déjalo vacío si solo hay interés.`}>
                  <input id="pg-principal" name="principal" inputMode="decimal" placeholder="0.00" aria-describedby="pg-principal-hint" className={inputCls} />
                </Field>
                <Field label="Interés" id="pg-interest" hint="Se registra aparte: es ingreso si te deben, gasto si debes.">
                  <input id="pg-interest" name="interest" inputMode="decimal" placeholder="0.00" aria-describedby="pg-interest-hint" className={inputCls} />
                </Field>
              </div>
              <Field label="Notas (opcional)" id="pg-notes"><textarea id="pg-notes" name="notes" rows={2} maxLength={1000} className={inputCls} /></Field>
            </ActionForm>
          )}
        </Disclosure>
      </section>}

      <section aria-labelledby="movs" className="mb-6 card">
        <h2 id="movs" className="mb-3 section-title">Movimientos del préstamo</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-muted">Sin movimientos de dinero todavía.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {movements.map((m) => {
              const isPayment = m.type === "loan_collection" || m.type === "loan_repayment";
                            return (
                <li key={m.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{TYPE_LABEL[m.type] ?? m.type} · {fmtDate(m.date)}{m.status === "reversed" ? " · Anulado" : ""}</span>
                    <Link href={`/movimientos/${m.id}`} className="text-primary underline">Ver movimiento</Link>
                  </div>
                  <p className="text-muted">
                    {m.accountName ?? ""} · Capital {money(m.principalMinor)}
                    {m.interestMinor !== 0n ? ` · Interés ${money(m.interestMinor)}` : ""}
                    {m.notes ? ` · ${m.notes}` : ""}
                  </p>
                  {m.status === "posted" && isPayment && (
                    <div className="mt-2">
                      <ConfirmActionDialog
                        id={`del-pay-${m.id}`} triggerLabel="Eliminar pago" triggerAriaLabel={`Eliminar pago del ${fmtDate(m.date)} por ${money(m.principalMinor + m.interestMinor)}`}
                        title="¿Eliminar este pago?" confirmLabel="Eliminar pago" action={voidPaymentAction.bind(null, id, m.id)}
                        notice="No se borra del historial: se anula con un reverso auditable. Dejará de contar en tus saldos y reportes; el saldo pendiente del préstamo se restaura."
                      >
                        <p className="rounded-lg bg-surface-2 px-3 py-2.5">
                          <strong className="block">{TYPE_LABEL[m.type] ?? m.type}</strong>
                          <span className="text-muted">{fmtDate(m.date)} · {m.accountName ?? ""} · </span><strong>{money(m.principalMinor + m.interestMinor)}</strong>
                        </p>
                      </ConfirmActionDialog>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="hist" className="card">
        <h2 id="hist" className="mb-3 section-title">Historial de modificaciones</h2>
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
