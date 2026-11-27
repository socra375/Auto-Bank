import type { Metadata } from "next";
import Link from "next/link";
import { ACCOUNT_TYPE_LABEL } from "@/components/finance/format";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, ErrorState } from "@/components/states/states";
import { ActionForm } from "@/components/ui/action-form";
import { CURRENCY_OPTIONS, Disclosure, Field, inputCls, Options } from "@/components/ui/fields";
import { archiveAccountAction, createAccountAction, unarchiveAccountAction, updateAccountAction } from "@/lib/actions/accounts";
import { requireOwner } from "@/lib/auth/guard";
import { fmtDate, todayDR } from "@/lib/dates";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { safe } from "@/lib/safe";
import { listAccounts, totalsByCurrency, type AccountWithBalance } from "@/server/accounts";
import { getExecutor } from "@/server/db";
import { consolidate, SIN_TASA_LABEL } from "@/server/fx";

export const metadata: Metadata = { title: "Cuentas" };

function AccountCard({ a }: { a: AccountWithBalance }) {
  const archived = a.status === "archived";
  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{a.name}</h3>
          <p className="text-xs text-muted">
            {ACCOUNT_TYPE_LABEL[a.type]} · {a.currency}{archived ? " · Archivada" : ""}
          </p>
        </div>
        <p className={`whitespace-nowrap text-lg font-semibold ${a.balanceMinor < 0n ? "text-negative" : ""}`}>{formatMoney(a.balanceMinor, a.currency)}</p>
      </div>
      {a.description && <p className="mt-1 text-sm text-muted">{a.description}</p>}
      <p className="mt-1 text-xs text-muted">Saldo inicial {formatMoney(a.openingBalanceMinor, a.currency)} al {fmtDate(a.openingDate)}</p>
      <div className="mt-3 flex flex-wrap items-start gap-3">
        <Link href={`/movimientos?cuenta=${a.id}`} className="rounded-md border border-border px-3 py-2 text-sm">Ver movimientos</Link>
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
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="confirmNonZero" /> Confirmo archivar con saldo distinto de cero
              </label>
            )}
          </ActionForm>
        )}
      </div>
    </li>
  );
}

export default async function Page() {
  const userId = await requireOwner();
  const ex = getExecutor();
  const res = await safe(listAccounts(ex, userId));
  if (res.failed) {
    return (<><PageHeader title="Cuentas" /><ErrorState title="No se pudieron cargar las cuentas" description="Inténtalo de nuevo en unos segundos." /></>);
  }
  const accounts = res.data;
  const active = accounts.filter((a) => a.status === "active");
  const archived = accounts.filter((a) => a.status === "archived");
  const totals = totalsByCurrency(accounts);
  const hasUsd = active.some((a) => a.currency === "USD");
  const hasDop = active.some((a) => a.currency === "DOP");
  // Consolidated view only when both currencies are in play, at the rate recorded on/before today; otherwise an explicit marker.
  const consolidated = hasUsd && hasDop
    ? await safe(consolidate(ex, userId, CURRENCIES.filter((c) => totals[c] !== 0n).map((c) => ({ minor: totals[c], currency: c, date: todayDR() })), "DOP"))
    : null;

  return (
    <>
      <PageHeader title="Cuentas" description="Saldos = saldo inicial + movimientos. Cada moneda se totaliza por separado." />

      {accounts.length > 0 && (
        <section aria-label="Totales por moneda" className="mb-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {CURRENCIES.map((c) => (
              <div key={c} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm text-muted">Total en {c} (cuentas activas)</p>
                <p className="text-2xl font-semibold">{formatMoney(totals[c], c)}</p>
              </div>
            ))}
          </div>
          {consolidated && !consolidated.failed && (
            <p className="mt-2 text-sm text-muted">
              {consolidated.data.status === "ok" ? (
                <>
                  Consolidado en DOP: <strong>{formatMoney(consolidated.data.totalMinor, "DOP")}</strong>
                  {consolidated.data.rates.map((r) => ` · tasa 1 ${r.base} = ${r.rate} (${fmtDate(r.date)})`).join("")}
                </>
              ) : (
                <>{SIN_TASA_LABEL}. <Link href="/configuracion" className="text-primary underline">Registrar tasa</Link></>
              )}
            </p>
          )}
        </section>
      )}

      <Disclosure summary="Nueva cuenta" className="mb-6">
        <ActionForm action={createAccountAction} submit="Crear cuenta" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" id="new-name"><input id="new-name" name="name" required maxLength={80} className={inputCls} /></Field>
            <Field label="Tipo" id="new-type">
              <select id="new-type" name="type" required defaultValue="bank" className={inputCls}>
                <Options items={Object.entries(ACCOUNT_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
              </select>
            </Field>
            <Field label="Moneda" id="new-currency" hint="No se puede cambiar después.">
              <select id="new-currency" name="currency" required defaultValue="DOP" aria-describedby="new-currency-hint" className={inputCls}><Options items={CURRENCY_OPTIONS} /></select>
            </Field>
            <Field label="Saldo inicial" id="new-opening">
              <input id="new-opening" name="openingBalance" inputMode="decimal" placeholder="0.00" defaultValue="0.00" className={inputCls} />
            </Field>
            <Field label="Fecha del saldo inicial" id="new-date"><input id="new-date" name="openingDate" type="date" required defaultValue={todayDR()} className={inputCls} /></Field>
            <Field label="Descripción (opcional)" id="new-desc"><input id="new-desc" name="description" maxLength={500} className={inputCls} /></Field>
          </div>
        </ActionForm>
      </Disclosure>

      {accounts.length === 0 ? (
        <EmptyState title="Aún no tienes cuentas" description="Crea tu primera cuenta para empezar a registrar movimientos." />
      ) : (
        <>
          <ul className="grid gap-3 lg:grid-cols-2">{active.map((a) => <AccountCard key={a.id} a={a} />)}</ul>
          {archived.length > 0 && (
            <section aria-labelledby="archived" className="mt-8">
              <h2 id="archived" className="mb-3 text-base font-semibold">Archivadas</h2>
              <ul className="grid gap-3 lg:grid-cols-2">{archived.map((a) => <AccountCard key={a.id} a={a} />)}</ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
