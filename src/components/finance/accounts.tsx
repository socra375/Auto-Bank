import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Disclosure, Field, inputCls } from "@/components/ui/fields";
import { archiveAccountAction, unarchiveAccountAction, updateAccountAction } from "@/lib/actions/accounts";
import { fmtDate } from "@/lib/dates";
import { CURRENCIES, formatMoney, type TotalsByCurrency } from "@/lib/money";
import type { AccountWithBalance } from "@/server/accounts";
import { SIN_TASA_LABEL, type Consolidated } from "@/server/fx";
import { AccountCard } from "./account-card";

/** One account: the card face (presentational) plus a tray with every existing action. */
export function AccountItem({ a }: { a: AccountWithBalance }) {
  const archived = a.status === "archived";
  return (
    <li className="ac-item">
      <AccountCard uid={a.id} name={a.name} type={a.type} currency={a.currency} balanceMinor={a.balanceMinor} archived={archived} />
      <div className="ac-tray">
        {a.description && <p className="text-sm">{a.description}</p>}
        <p className="text-xs text-muted">Saldo inicial {formatMoney(a.openingBalanceMinor, a.currency)} al {fmtDate(a.openingDate)}{archived ? " · Cuenta archivada: su historial se conserva" : ""}</p>
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/movimientos?cuenta=${a.id}`} className="btn btn-secondary">Ver movimientos</Link>
          {archived ? (
            <ActionForm action={unarchiveAccountAction} submit="Reactivar" variant="ghost" className="space-y-2"><input type="hidden" name="id" value={a.id} /></ActionForm>
          ) : (
            <ActionForm action={archiveAccountAction} submit="Archivar" variant="ghost" className="space-y-2">
              <input type="hidden" name="id" value={a.id} />
              {a.balanceMinor !== 0n && (
                <label className="check !min-h-0 text-xs">
                  <input type="checkbox" name="confirmNonZero" /> Confirmo archivar con saldo distinto de cero
                </label>
              )}
            </ActionForm>
          )}
        </div>
        <Disclosure summary="Editar" className="!shadow-none">
          <ActionForm action={updateAccountAction} submit="Guardar">
            <input type="hidden" name="id" value={a.id} />
            <Field label="Nombre" id={`n-${a.id}`}><input id={`n-${a.id}`} name="name" required maxLength={80} defaultValue={a.name} className={inputCls} /></Field>
            <Field label="Descripción" id={`d-${a.id}`}><input id={`d-${a.id}`} name="description" maxLength={500} defaultValue={a.description ?? ""} className={inputCls} /></Field>
          </ActionForm>
        </Disclosure>
      </div>
    </li>
  );
}

export function AccountTotals({ totals, consolidated }: { totals: TotalsByCurrency; consolidated: Consolidated | null }) {
  return (
        <section aria-label="Totales por moneda" className="mb-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {CURRENCIES.map((c) => (
              <div key={c} className="card">
                <div className="flex items-center justify-between gap-3"><p className="eyebrow">Total cuentas activas</p><span className="badge badge-info">{c}</span></div>
                <p className="amount-xl mt-2">{formatMoney(totals[c], c)}</p>
              </div>
            ))}
          </div>
          {consolidated && (
            <p className="mt-3 text-sm text-muted">
              {consolidated.status === "ok" ? (
                <>
                  Consolidado en DOP: <strong>{formatMoney(consolidated.totalMinor, "DOP")}</strong>
                  {consolidated.rates.map((r) => ` · tasa 1 ${r.base} = ${r.rate} (${fmtDate(r.date)})`).join("")}
                </>
              ) : (
                <>{SIN_TASA_LABEL}. <Link href="/configuracion" className="font-semibold text-primary underline">Registrar tasa</Link></>
              )}
            </p>
          )}
        </section>
  );
}
