import Link from "next/link";
import { fmtDate } from "@/lib/dates";
import { CURRENCIES, formatMoney, type TotalsByCurrency } from "@/lib/money";
import type { AccountWithBalance } from "@/server/accounts";
import { SIN_TASA_LABEL, type Consolidated } from "@/server/fx";
import { AccountActions } from "./account-actions";
import { AccountCard } from "./account-card";

/** One account: the card face (presentational) plus a compact tray: two fixed meta lines and one action row (same height on every card). */
export function AccountItem({ a }: { a: AccountWithBalance }) {
  const archived = a.status === "archived";
  return (
    <li className="ac-item">
      <AccountCard uid={a.id} name={a.name} type={a.type} currency={a.currency} balanceMinor={a.balanceMinor} archived={archived} />
      <div className="ac-tray">
        <div className="ac-meta">
          <p className="truncate text-sm">{archived ? "Archivada: su historial se conserva" : a.description || <span className="text-muted">Sin descripción</span>}</p>
          <p className="truncate text-xs text-muted">Saldo inicial {formatMoney(a.openingBalanceMinor, a.currency)} al {fmtDate(a.openingDate)}</p>
        </div>
        <div className="ac-actions">
          <Link href={`/movimientos?cuenta=${a.id}`} className="btn btn-primary ac-main">Ver movimientos</Link>
          <AccountActions id={a.id} name={a.name} description={a.description} archived={archived} balanceLabel={formatMoney(a.balanceMinor, a.currency)} nonZero={a.balanceMinor !== 0n} />
        </div>
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
