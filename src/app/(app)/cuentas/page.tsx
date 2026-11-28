import type { Metadata } from "next";
import { NewAccountTile } from "@/components/finance/account-card";
import { AccountItem, AccountTotals } from "@/components/finance/accounts";
import { ACCOUNT_TYPE_LABEL } from "@/components/finance/format";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, ErrorState } from "@/components/states/states";
import { ActionForm } from "@/components/ui/action-form";
import { CURRENCY_OPTIONS, Disclosure, Field, inputCls, Options } from "@/components/ui/fields";
import { createAccountAction } from "@/lib/actions/accounts";
import { requireOwner } from "@/lib/auth/guard";
import { todayDR } from "@/lib/dates";
import { CURRENCIES } from "@/lib/money";
import { safe } from "@/lib/safe";
import { listAccounts, totalsByCurrency } from "@/server/accounts";
import { getExecutor } from "@/server/db";
import { consolidate } from "@/server/fx";

export const metadata: Metadata = { title: "Cuentas" };

export default async function Page({ searchParams }: { searchParams: Promise<{ nuevo?: string | string[] }> }) {
  const userId = await requireOwner();
  const wantsNew = !!(await searchParams).nuevo;
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

      {accounts.length > 0 && <AccountTotals totals={totals} consolidated={consolidated && !consolidated.failed ? consolidated.data : null} />}

      <Disclosure id="nueva-cuenta" summary="Nueva cuenta" open={wantsNew || accounts.length === 0} className="mb-6 scroll-mt-20">
        <ActionForm action={createAccountAction} submit="Crear cuenta" resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
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
        <EmptyState title="Aún no tienes cuentas" description="Crea tu primera cuenta con el formulario de arriba para empezar a registrar movimientos." />
      ) : (
        <>
          <ul className="ac-grid stagger-fade" aria-label="Cuentas activas">
            {active.map((a) => <AccountItem key={a.id} a={a} />)}
            <li className="ac-item"><NewAccountTile href="/cuentas?nuevo=1#nueva-cuenta" /></li>
          </ul>
          {archived.length > 0 && (
            <section aria-labelledby="archived" className="mt-8">
              <h2 id="archived" className="mb-3 section-title">Archivadas</h2>
              <ul className="ac-grid stagger-fade">{archived.map((a) => <AccountItem key={a.id} a={a} />)}</ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
