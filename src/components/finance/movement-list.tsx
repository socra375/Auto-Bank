import Link from "next/link";
import { fmtDate } from "@/lib/dates";
import type { MovementRow } from "@/server/ledger";
import { EmptyState } from "@/components/states/states";
import { statusLabel, summarize, toneCls, TYPE_LABEL } from "./format";

function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${muted ? "border-border text-muted" : "border-primary text-primary"}`}>
      {children}
    </span>
  );
}

/** Desktop table + mobile cards over the same rows. Pure/presentational. */
export function MovementList({ items }: { items: MovementRow[] }) {
  if (!items.length) {
    return <EmptyState title="Sin movimientos" description="No hay movimientos que coincidan con los filtros." />;
  }
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Movimientos</caption>
          <thead className="border-b border-border text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
              <th scope="col" className="px-4 py-3 font-medium">Descripción</th>
              <th scope="col" className="px-4 py-3 font-medium">Tipo</th>
              <th scope="col" className="px-4 py-3 font-medium">Cuenta(s)</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Monto</th>
              <th scope="col" className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const s = summarize(m);
              return (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3">{fmtDate(m.date)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/movimientos/${m.id}`} className="font-medium text-primary underline-offset-2 hover:underline">{m.description}</Link>
                    {m.categoryName && <div className="text-xs text-muted">{m.categoryName}</div>}
                  </td>
                  <td className="px-4 py-3">{TYPE_LABEL[m.type] ?? m.type}</td>
                  <td className="px-4 py-3">{s.accounts}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${toneCls(s.tone)}`}>{s.amount}</td>
                  <td className="px-4 py-3"><Badge muted={m.status === "posted"}>{statusLabel(m)}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {items.map((m) => {
          const s = summarize(m);
          return (
            <li key={m.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/movimientos/${m.id}`} className="font-medium text-primary">{m.description}</Link>
                <span className={`whitespace-nowrap font-semibold ${toneCls(s.tone)}`}>{s.amount}</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                {fmtDate(m.date)} · {TYPE_LABEL[m.type] ?? m.type}{m.categoryName ? ` · ${m.categoryName}` : ""}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                <span>{s.accounts}</span>
                <Badge muted={m.status === "posted"}>{statusLabel(m)}</Badge>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
