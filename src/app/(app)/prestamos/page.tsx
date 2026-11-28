import type { Metadata } from "next";
import Link from "next/link";
import type { SearchParams } from "@/components/finance/filters";
import { LoanCard, STATUS_LABEL } from "@/components/finance/loans";
import { TYPE_LABEL } from "@/components/finance/format";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, ErrorState } from "@/components/states/states";
import { ActionForm } from "@/components/ui/action-form";
import { CURRENCY_OPTIONS, Disclosure, Field, inputCls, Options } from "@/components/ui/fields";
import { CheckCircle2 } from "lucide-react";
import { createLoanAction, removeLoanAction } from "@/lib/actions/loans";
import { requireOwner } from "@/lib/auth/guard";
import { fmtDate, todayDR } from "@/lib/dates";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { safe } from "@/lib/safe";
import { listAccounts } from "@/server/accounts";
import { getExecutor } from "@/server/db";
import { counterpartyHistory, listDueLoans, listLoans, loanSummary } from "@/server/loans";
import { loanFiltersSchema } from "@/server/schemas";

export const metadata: Metadata = { title: "Préstamos y deudas" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const userId = await requireOwner();
  const sp = await searchParams;
  const tab = first(sp.tab) === "pagar" ? "pagar" : "cobrar";
  const raw = { direction: tab === "pagar" ? "payable" : "receivable", status: first(sp.estado), currency: first(sp.moneda), q: first(sp.q), includeCancelled: first(sp.cancelados) === "1" };
  const parsed = loanFiltersSchema.safeParse(raw);
  const filters = parsed.success ? parsed.data : { direction: raw.direction as "payable" | "receivable" };
  const persona = first(sp.persona);
  const ex = getExecutor();

  const res = await safe(Promise.all([
    listLoans(ex, userId, filters), loanSummary(ex, userId), listDueLoans(ex, userId, 30), listAccounts(ex, userId),
    persona ? counterpartyHistory(ex, userId, persona) : null,
  ]));
  if (res.failed) {
    return (<><PageHeader title="Préstamos y deudas" /><ErrorState title="No se pudieron cargar los préstamos" description="Inténtalo de nuevo en unos segundos." /></>);
  }
  const [loans, summary, due, accounts, history] = res.data;
  const activeAccounts = accounts.filter((a) => a.status === "active");
  const formKey = crypto.randomUUID(); // idempotency key: new per rendered form
  const tabHref = (t: string) => `/prestamos?tab=${t}`;
  const v = (k: string) => first(sp[k]) ?? "";
  const nuevo = first(sp.nuevo) === "payable" ? "payable" : first(sp.nuevo) === "receivable" ? "receivable" : undefined;
  const noFilters = !raw.status && !raw.currency && !raw.q && !raw.includeCancelled;
  const noLoansYet = noFilters && loans.length === 0 && due.length === 0 && CURRENCIES.every((c) => summary.receivable[c] === 0n && summary.payable[c] === 0n);
  const formOpen = !!nuevo || noLoansYet;
  const direction = nuevo ?? (tab === "pagar" ? "payable" : "receivable");

  const newForm = (
  <Disclosure id="nuevo-prestamo" summary="Nuevo préstamo o deuda" open={formOpen} className="mb-6 scroll-mt-20">
    <ActionForm action={createLoanAction} submit="Registrar" resetOnSuccess>
      <input type="hidden" name="idempotencyKey" value={formKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" id="ln-direction">
          <select id="ln-direction" name="direction" required defaultValue={direction} className={inputCls}>
            <Options items={[{ value: "receivable", label: "Presté dinero (me deben)" }, { value: "payable", label: "Me prestaron (debo)" }]} />
          </select>
        </Field>
        <Field label="Persona o entidad" id="ln-counterparty"><input id="ln-counterparty" name="counterparty" autoFocus={!!nuevo} required maxLength={120} className={inputCls} /></Field>
        <Field label="Capital" id="ln-principal"><input id="ln-principal" name="principal" required inputMode="decimal" placeholder="0.00" className={inputCls} /></Field>
        <Field label="Moneda" id="ln-currency">
          <select id="ln-currency" name="currency" required defaultValue="DOP" className={inputCls}><Options items={CURRENCY_OPTIONS} /></select>
        </Field>
        <Field label="Fecha de inicio" id="ln-start"><input id="ln-start" name="startDate" type="date" required defaultValue={todayDR()} className={inputCls} /></Field>
        <Field label="Vencimiento (opcional)" id="ln-due"><input id="ln-due" name="dueDate" type="date" className={inputCls} /></Field>
        <Field label="Tasa anual % (opcional, informativa)" id="ln-rate" hint="El interés real es el que registres en cada pago.">
          <input id="ln-rate" name="interestRatePct" inputMode="decimal" placeholder="0" aria-describedby="ln-rate-hint" className={inputCls} />
        </Field>
        <Field label="Cuenta (misma moneda)" id="ln-account" hint="Obligatoria si el dinero se mueve ahora; también sirve como cuenta habitual.">
          <select id="ln-account" name="accountId" defaultValue="" aria-describedby="ln-account-hint" className={inputCls}>
            <Options placeholder="Sin cuenta" items={activeAccounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))} />
          </select>
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" name="funded" />
        <span>El dinero sale/entra de la cuenta ahora. Desmárcalo si es una deuda ya existente (no se mueve dinero).</span>
      </label>
      <Field label="Notas (opcional)" id="ln-notes"><textarea id="ln-notes" name="notes" rows={2} maxLength={1000} className={inputCls} /></Field>
    </ActionForm>
  </Disclosure>
  );

  return (
    <>
      <PageHeader
        title="Préstamos y deudas"
        description="Prestar no es un gasto ni pedir prestado es un ingreso: solo el interés cuenta como ingreso o gasto. Cada moneda se totaliza por separado."
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Link href="/prestamos?nuevo=receivable#nuevo-prestamo" className="btn btn-primary">Presté dinero</Link>
            <Link href="/prestamos?nuevo=payable#nuevo-prestamo" className="btn btn-primary">Me prestaron</Link>
          </div>
        }
      />

      {formOpen && newForm}

      {first(sp.eliminado) && (
        <p role="status" className="feedback mb-4 flex items-start gap-2 rounded-lg bg-positive-soft px-3 py-2.5 text-sm text-positive">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><span>Préstamo eliminado (anulado). Ya no cuenta en por cobrar / por pagar; el historial se conserva.</span>
        </p>
      )}

      <section aria-label="Resumen por moneda" className="mb-6 grid gap-4 sm:grid-cols-2">
        {CURRENCIES.map((c) => (
          <div key={c} className="card">
            <div className="mb-3 flex items-center justify-between"><span className="eyebrow">Resumen</span><span className="badge badge-info">{c}</span></div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-xs text-muted">Por cobrar</dt><dd className="amount text-lg pos">{formatMoney(summary.receivable[c], c)}</dd></div>
              <div><dt className="text-xs text-muted">Por pagar</dt><dd className="amount text-lg neg">{formatMoney(summary.payable[c], c)}</dd></div>
              <div><dt className="text-xs text-muted">Interés cobrado</dt><dd className="amount">{formatMoney(summary.interestCollected[c], c)}</dd></div>
              <div><dt className="text-xs text-muted">Interés pagado</dt><dd className="amount">{formatMoney(summary.interestPaid[c], c)}</dd></div>
            </dl>
          </div>
        ))}
      </section>

      <section aria-labelledby="due" className="mb-6">
        <h2 id="due" className="mb-3 section-title">Vencidos y próximos a vencer (30 días)</h2>
        {due.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong/60 bg-surface px-4 py-8 text-center text-sm text-muted">No hay préstamos vencidos ni por vencer pronto.</p>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">{due.map((l) => <LoanCard key={l.id} l={l} remove={removeLoanAction.bind(null, l.id)} />)}</ul>
        )}
      </section>


      {!formOpen && newForm}

      <nav aria-label="Tipo de préstamo" className="mb-4 flex gap-2">
        {[["cobrar", "Por cobrar"], ["pagar", "Por pagar"]].map(([t, label]) => (
          <Link key={t} href={tabHref(t)} aria-current={tab === t ? "page" : undefined}
            className="pill">
            {label}
          </Link>
        ))}
      </nav>

      <form method="get" action="/prestamos" className="mb-4 grid gap-3 card sm:grid-cols-4">
        <input type="hidden" name="tab" value={tab} />
        <Field label="Estado" id="lf-estado">
          <select id="lf-estado" name="estado" defaultValue={v("estado")} className={inputCls}>
            <Options placeholder="Todos" items={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
          </select>
        </Field>
        <Field label="Moneda" id="lf-moneda">
          <select id="lf-moneda" name="moneda" defaultValue={v("moneda")} className={inputCls}><Options placeholder="Todas" items={CURRENCIES.map((c) => ({ value: c, label: c }))} /></select>
        </Field>
        <Field label="Persona" id="lf-q"><input id="lf-q" name="q" type="search" defaultValue={v("q")} className={inputCls} /></Field>
        <label className="check sm:col-span-4">
          <input type="checkbox" name="cancelados" value="1" defaultChecked={v("cancelados") === "1"} />
          Incluir préstamos cancelados
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn btn-primary">Filtrar</button>
          <Link href={tabHref(tab)} className="btn btn-secondary">Limpiar</Link>
        </div>
      </form>

      {loans.length === 0 ? (
        <EmptyState
          title={tab === "cobrar" ? "No hay préstamos por cobrar" : "No hay deudas por pagar"}
          description="Registra uno con «Nuevo préstamo o deuda», o ajusta los filtros."
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">{loans.map((l) => <LoanCard key={l.id} l={l} remove={removeLoanAction.bind(null, l.id)} />)}</ul>
      )}

      {history && (
        <section aria-labelledby="persona" className="mt-8 card">
          <h2 id="persona" className="mb-3 section-title">Historial con {persona}</h2>
          {history.loans.length === 0 ? (
            <p className="text-sm text-muted">No hay préstamos con esa persona.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {history.movements.map((m) => {
                const l = history.loans.find((x) => x.id === m.loanId)!;
                return (
                  <li key={m.id}>
                    {fmtDate(m.date)} · {TYPE_LABEL[m.type] ?? m.type} · {formatMoney(m.principalMinor + m.interestMinor, l.currency)}
                    {m.status === "reversed" ? " (anulado)" : ""} ·{" "}
                    <Link href={`/prestamos/${l.id}`} className="text-primary underline">ver préstamo</Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}
    </>
  );
}
