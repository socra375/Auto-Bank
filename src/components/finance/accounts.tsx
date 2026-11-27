import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Disclosure, Field, inputCls } from "@/components/ui/fields";
import { archiveAccountAction, unarchiveAccountAction, updateAccountAction } from "@/lib/actions/accounts";
import { fmtDate } from "@/lib/dates";
import { CURRENCIES, formatMoney, type TotalsByCurrency } from "@/lib/money";
import type { AccountWithBalance } from "@/server/accounts";
import { SIN_TASA_LABEL, type Consolidated } from "@/server/fx";
import { ACCOUNT_TYPE_LABEL } from "./format";
import { Banknote, Landmark, PiggyBank, Smartphone, type LucideIcon } from "lucide-react";

const TYPE_ICON: Record<string, LucideIcon> = { cash: Banknote, bank: Landmark, savings: PiggyBank, digital: Smartphone };

export function AccountCard({ a }: { a: AccountWithBalance }) {
  const archived = a.status === "archived";
  const TypeIcon = TYPE_ICON[a.type] ?? Landmark;
  return (
    <li className="card flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 section-title"><TypeIcon className="size-5 text-primary" aria-hidden />{a.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {ACCOUNT_TYPE_LABEL[a.type]} · {a.currency}{archived ? " · Archivada" : ""}
          </p>
        </div>
        <p className={`amount text-xl ${a.balanceMinor < 0n ? "neg" : ""}`}>{formatMoney(a.balanceMinor, a.currency)}</p>
      </div>
      {a.description && <p className="mt-1 text-sm text-muted">{a.description}</p>}
      <p className="mt-2 text-xs text-muted">Saldo inicial {formatMoney(a.openingBalanceMinor, a.currency)} al {fmtDate(a.openingDate)}</p>
      <div className="mt-auto flex flex-wrap items-start gap-3 pt-4">
        <Link href={`/movimientos?cuenta=${a.id}`} className="btn btn-secondary btn-sm">Ver movimientos</Link>
        <div className="min-w-60 flex-1">
          <Disclosure summary="Editar">
            <ActionForm action={updateAccountAction} submit="Guardar">
              <input type="hidden" name="id" value={a.id} />
              <Field label="Nombre" id={`n-${a.id}`}><input id={`n-${a.id}`} name="name" required maxLength={80} defaultValue={a.name} className={inputCls} /></Field>
              <Field label="Descripción" id={`d-${a.id}`}><input id={`d-${a.id}`} name="description" maxLength={500} defaultValue={a.description ?? ""} className={inputCls} /></Field>
            </ActionForm>
          </Disclosure>
        </div>
        {archived ? (
          <ActionForm action={unarchiveAccountAction} submit="Reactivar" variant="ghost"><input type="hidden" name="id" value={a.id} /></ActionForm>
        ) : (
          <ActionForm action={archiveAccountAction} submit="Archivar" variant="ghost">
            <input type="hidden" name="id" value={a.id} />
            {a.balanceMinor !== 0n && (
              <label className="check !min-h-0 text-xs">
                <input type="checkbox" name="confirmNonZero" /> Confirmo archivar con saldo distinto de cero
              </label>
            )}
          </ActionForm>
        )}
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
