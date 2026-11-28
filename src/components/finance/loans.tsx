import Link from "next/link";
import { AlertCircle, Ban, CheckCircle2, CircleDot, Clock, type LucideIcon } from "lucide-react";
import { fmtDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { ConfirmActionDialog, type ConfirmAction } from "@/components/ui/confirm-dialog";
import type { LoanRow, LoanStatus } from "@/server/loans";

export const STATUS_LABEL: Record<LoanStatus, string> = { pendiente: "Pendiente", parcial: "Parcial", liquidado: "Liquidado", vencido: "Vencido", cancelado: "Cancelado" };
const STATUS_CLS: Record<LoanStatus, string> = {
  pendiente: "badge-neutral", parcial: "badge-info", liquidado: "badge-positive", vencido: "badge-negative", cancelado: "badge-neutral line-through",
};
const STATUS_ICON: Record<LoanStatus, LucideIcon> = { pendiente: Clock, parcial: CircleDot, liquidado: CheckCircle2, vencido: AlertCircle, cancelado: Ban };

export function StatusBadge({ status }: { status: LoanStatus }) {
  const Icon = STATUS_ICON[status];
  return <span className={`badge ${STATUS_CLS[status]}`}><Icon className="size-3" aria-hidden />{STATUS_LABEL[status]}</span>;
}

const REMOVE_NOTICE = "No se borra del historial: se anula con un reverso auditable. Dejará de contar en tus saldos y reportes.";

/** "Eliminar préstamo" with its confirmation. Loans with active payments explain that the payments go first. */
export function RemoveLoanButton({ l, action, className }: { l: LoanRow; action: ConfirmAction; className?: string }) {
  const hasPayments = l.principalPaidMinor > 0n || l.interestPaidMinor > 0n;
  return (
    <ConfirmActionDialog
      id={`del-loan-${l.id}`} triggerLabel="Eliminar préstamo" triggerAriaLabel={`Eliminar préstamo de ${l.counterparty}`} triggerClassName={className}
      title="¿Eliminar este préstamo?" action={action} confirmLabel="Eliminar préstamo"
      blocked={hasPayments ? <>Primero elimina los pagos de este préstamo. Los encuentras en <Link href={`/prestamos/${l.id}`} className="font-semibold text-primary underline">el detalle del préstamo</Link>.</> : undefined}
      notice={`${REMOVE_NOTICE} El préstamo dejará de contar como ${l.direction === "receivable" ? "por cobrar" : "por pagar"}${l.funded ? " y el movimiento de dinero de su creación se revierte en la cuenta" : ""}.`}
    >
      <p className="rounded-lg bg-surface-2 px-3 py-2.5">
        <strong className="block break-words">{l.counterparty}</strong>
        <span className="text-muted">{l.direction === "receivable" ? "Me debe" : "Le debo"} · desde {fmtDate(l.startDate)} · capital </span><strong>{formatMoney(l.principalMinor, l.currency)}</strong>
      </p>
    </ConfirmActionDialog>
  );
}

export function LoanCard({ l, remove }: { l: LoanRow; remove?: ConfirmAction }) {
  return (
    <li className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate section-title">
            <Link href={`/prestamos/${l.id}`} className="underline-offset-2 hover:text-primary hover:underline">{l.counterparty}</Link>
          </h3>
          <p className="text-xs text-muted">
            {l.direction === "receivable" ? "Me debe" : "Le debo"} · {l.currency} · desde {fmtDate(l.startDate)}
            {l.dueDate ? ` · vence ${fmtDate(l.dueDate)}` : ""}
          </p>
        </div>
        <StatusBadge status={l.status} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
        <div><dt className="text-xs text-muted">Pendiente</dt><dd className={`amount text-lg ${l.direction === "receivable" ? "pos" : "neg"}`}>{formatMoney(l.outstandingMinor, l.currency)}</dd></div>
        <div><dt className="text-xs text-muted">Capital original</dt><dd className="amount text-lg font-medium">{formatMoney(l.principalMinor, l.currency)}</dd></div>
      </dl>
      {remove && l.status !== "cancelado" && <div className="mt-3 border-t border-border pt-3"><RemoveLoanButton l={l} action={remove} /></div>}
    </li>
  );
}
