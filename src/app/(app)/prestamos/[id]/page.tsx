import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TYPE_LABEL } from "@/components/finance/format";
import { StatusBadge } from "@/components/finance/loans";
import { PageHeader } from "@/components/shell/page-header";
import { ErrorState } from "@/components/states/states";
import { ActionForm } from "@/components/ui/action-form";
import { Disclosure, Field, inputCls } from "@/components/ui/fields";
import { cancelLoanAction, registerPaymentAction, voidLoanOriginAction, voidPaymentAction } from "@/lib/actions/loans";
import { requireOwner } from "@/lib/auth/guard";
import { fmtDate, todayDR } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { listAccounts } from "@/server/accounts";
import { getExecutor } from "@/server/db";
import { DomainError } from "@/server/errors";
import { getLoan } from "@/server/loans";

export const metadata: Metadata = { title: "Detalle de préstamo" };

const ACTION_LABEL: Record<string, string> = {
  "loan.create": "Préstamo registrado", "loan.payment": "Pago registrado", "loan.payment_void": "Pago anulado", "loan.origin_void": "Desembolso inicial anulado", "loan.cancel": "Préstamo cancelado",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireOwner();
  const { id } = await params;
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
  const canCancel = !cancelled && !l.funded && !activePayments;
  const formKey = crypto.randomUUID(); // idempotency key: new per rendered form
  const money = (n: bigint) => formatMoney(n, l.currency);

  return (
    <>
      <PageHeader title={l.counterparty} description={`${receivable ? "Me debe" : "Le debo"} · ${l.currency} · desde ${fmtDate(l.startDate)}${l.dueDate ? ` · vence ${fmtDate(l.dueDate)}` : ""}`} />
      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <Link href="/prestamos" className="text-primary underline">← Volver a préstamos</Link>
        <Link href={`/prestamos?persona=${encodeURIComponent(l.counterparty)}`} className="text-primary underline">Historial con {l.counterparty}</Link>
      </div>

      <section aria-labelledby="resumen" className="mb-6 rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="resumen" className="text-base font-semibold">Resumen</h2>
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

      {cancelled && <p className="mb-6 rounded-xl border border-border bg-surface p-4 text-sm text-muted">Préstamo cancelado: no cuenta en tus totales ni admite nuevos pagos.</p>}
      {canCancel && (
        <section className="mb-6 max-w-md">
          <Disclosure summary="Cancelar préstamo">
            <ActionForm action={cancelLoanAction.bind(null, id)} submit="Confirmar cancelación" variant="danger">
              <p className="text-sm text-muted">El préstamo dejará de contar como pendiente. Esta acción no se puede deshacer.</p>
              <Field label="Motivo (opcional)" id="cancel-reason"><input id="cancel-reason" name="reason" maxLength={300} className={inputCls} /></Field>
            </ActionForm>
          </Disclosure>
        </section>
      )}

      {!cancelled && <section className="mb-6">
        <Disclosure summary={receivable ? "Registrar cobro" : "Registrar pago"}>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted">Necesitas una cuenta activa en {l.currency} para registrar pagos.</p>
          ) : (
            <ActionForm action={registerPaymentAction.bind(null, id)} submit={receivable ? "Registrar cobro" : "Registrar pago"} resetOnSuccess>
              <input type="hidden" name="idempotencyKey" value={formKey} />
              <div className="grid gap-3 sm:grid-cols-2">
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

      <section aria-labelledby="movs" className="mb-6 rounded-xl border border-border bg-surface p-4">
        <h2 id="movs" className="mb-3 text-base font-semibold">Movimientos del préstamo</h2>
        {movements.length === 0 ? (
          <p className="text-sm text-muted">Sin movimientos de dinero todavía.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {movements.map((m) => {
              const isPayment = m.type === "loan_collection" || m.type === "loan_repayment";
              const isOrigin = m.type === "loan_disbursement" || m.type === "loan_proceeds";
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
                  {m.status === "posted" && (isPayment || (isOrigin && !activePayments)) && (
                    <div className="mt-2 max-w-md">
                      <Disclosure summary={isPayment ? "Anular pago" : "Anular desembolso inicial"}>
                        <ActionForm
                          action={(isPayment ? voidPaymentAction : voidLoanOriginAction).bind(null, id, m.id)}
                          submit="Anular" variant="danger"
                        >
                          <Field label="Motivo (opcional)" id={`void-${m.id}`}><input id={`void-${m.id}`} name="reason" maxLength={300} className={inputCls} /></Field>
                        </ActionForm>
                      </Disclosure>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
