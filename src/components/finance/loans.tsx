import Link from "next/link";
import { fmtDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { LoanRow, LoanStatus } from "@/server/loans";

export const STATUS_LABEL: Record<LoanStatus, string> = { pendiente: "Pendiente", parcial: "Parcial", liquidado: "Liquidado", vencido: "Vencido" };
const STATUS_CLS: Record<LoanStatus, string> = {
  pendiente: "border-border text-muted", parcial: "border-primary text-primary",
  liquidado: "border-positive text-positive", vencido: "border-negative text-negative",
};

export function StatusBadge({ status }: { status: LoanStatus }) {
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function LoanCard({ l }: { l: LoanRow }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            <Link href={`/prestamos/${l.id}`} className="underline-offset-2 hover:underline">{l.counterparty}</Link>
          </h3>
          <p className="text-xs text-muted">
            {l.direction === "receivable" ? "Me debe" : "Le debo"} · {l.currency} · desde {fmtDate(l.startDate)}
            {l.dueDate ? ` · vence ${fmtDate(l.dueDate)}` : ""}
          </p>
        </div>
        <StatusBadge status={l.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-xs text-muted">Pendiente</dt><dd className="font-semibold">{formatMoney(l.outstandingMinor, l.currency)}</dd></div>
        <div><dt className="text-xs text-muted">Capital original</dt><dd>{formatMoney(l.principalMinor, l.currency)}</dd></div>
      </dl>
    </li>
  );
}
