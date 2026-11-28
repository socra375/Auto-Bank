import Link from "next/link";
import { fmtDate } from "@/lib/dates";
import type { MovementRow } from "@/server/ledger";
import { EmptyState } from "@/components/states/states";
import { ConfirmActionDialog, type ConfirmAction } from "@/components/ui/confirm-dialog";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { statusLabel, summarize, toneCls, TYPE_LABEL } from "./format";

function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <span className={`badge ${muted ? "badge-positive" : "badge-neutral"}`}>{children}</span>;
}

const TYPE_ICON: Record<string, LucideIcon> = { income: ArrowDownLeft, expense: ArrowUpRight, transfer: ArrowLeftRight, adjustment: SlidersHorizontal };

/** One accessible table; below 40rem of its own width the rows reflow into cards (container query, labels injected from data-label). */
export type RemoveMovement = { action: (id: string) => ConfirmAction; returnTo: string };
const REMOVABLE = new Set(["income", "expense", "transfer", "adjustment"]);
export const canRemove = (m: Pick<MovementRow, "type" | "status" | "loanId">) => m.status === "posted" && REMOVABLE.has(m.type) && !m.loanId;

/** Delete (auditable void) dialog for one movement; shared by the list rows and the detail page. */
export function RemoveMovementButton({ m, action, returnTo, className }: { m: MovementRow; action: ConfirmAction; returnTo: string; className?: string }) {
  const s = summarize(m);
  return (
    <ConfirmActionDialog
      id={`del-${m.id}`} triggerAriaLabel={`Eliminar movimiento: ${m.description}`} triggerClassName={className}
      title="¿Eliminar este movimiento?" action={action} hidden={{ returnTo }}
    >
      <p className="rounded-lg bg-surface-2 px-3 py-2.5">
        <strong className="block break-words">{m.description}</strong>
        <span className="text-muted">{fmtDate(m.date)} · {s.accounts} · </span><strong className="whitespace-nowrap">{s.tone === "pos" ? "+" : ""}{s.amount}</strong>
      </p>
    </ConfirmActionDialog>
  );
}

export function MovementList({ items, remove }: { items: MovementRow[]; remove?: RemoveMovement }) {
  if (!items.length) {
    return <EmptyState title="Sin movimientos" description="No hay movimientos que coincidan con los filtros." />;
  }
  return (
    <div role="region" tabIndex={0} aria-label="Tabla de movimientos" className="table-wrap card-flat shadow-[var(--shadow-card)]">
      <table className="data-table compact stack-table">
        <caption className="sr-only">Movimientos</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Descripción</th>
            <th scope="col">Tipo</th>
            <th scope="col">Cuenta(s)</th>
            <th scope="col" className="num">Monto</th>
            <th scope="col">Estado</th>
            {remove && <th scope="col">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((m) => {
            const s = summarize(m);
            const Icon = TYPE_ICON[m.type] ?? ArrowLeftRight;
            return (
              <tr key={m.id}>
                <td data-label="Fecha" className="whitespace-nowrap text-muted">{fmtDate(m.date)}</td>
                <td className="lead">
                  <Link href={`/movimientos/${m.id}`} className="font-semibold text-text underline-offset-2 hover:text-primary hover:underline">{m.description}</Link>
                  {m.categoryName && <div className="text-xs text-muted">{m.categoryName}</div>}
                </td>
                <td data-label="Tipo"><span className="inline-flex items-center gap-1.5"><Icon className="size-4 text-muted" aria-hidden />{TYPE_LABEL[m.type] ?? m.type}</span></td>
                <td data-label="Cuenta(s)">{s.accounts}</td>
                <td data-label="Monto" className={`num font-semibold ${toneCls(s.tone)}`}>{s.tone === "pos" ? "+" : ""}{s.amount}</td>
                <td data-label="Estado"><Badge muted={m.status === "posted"}>{m.type === "reversal" ? "Reversa" : statusLabel(m)}</Badge></td>
                {remove && (
                  <td data-label="Acciones" className="row-actions">
                    {canRemove(m) ? <RemoveMovementButton m={m} action={remove.action(m.id)} returnTo={remove.returnTo} />
                      : m.loanId ? <Link href={`/prestamos/${m.loanId}`} className="btn btn-secondary btn-sm">Gestionar en Préstamos</Link> : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
