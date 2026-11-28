/* Preview-only screen compositions built from the app's real components + fixtures. */
import Link from "next/link";
import { NewAccountTile } from "@/components/finance/account-card";
import { AccountItem, AccountTotals } from "@/components/finance/accounts";
import { AssetCard, ASSET_TYPE_LABEL, ASSET_TYPE_ORDER, NetWorthPanel, Sparkline } from "@/components/finance/assets";
import { FiltersForm, Pagination } from "@/components/finance/filters";
import { LoanCard, RemoveLoanButton } from "@/components/finance/loans";
import { AccountCard } from "@/components/finance/account-card";
import { ConfirmActionDialog, ConfirmPanel, VOID_NOTICE } from "@/components/ui/confirm-dialog";
import { MovementForm } from "@/components/finance/movement-form";
import { MovementList } from "@/components/finance/movement-list";
import { QuoteBoard } from "@/components/market/quote-board";
import { Change, fmtNum, fmtTs, StatusBadge } from "@/components/market/parts";
import { SymbolDetail } from "@/components/market/symbol-detail";
import { OverviewView } from "@/components/reports/overview";
import { PillNav } from "@/components/reports/parts";
import { BalancesSection, ComparisonSection, IncomeExpenseSection, NetWorthSection } from "@/components/reports/report-sections";
import { Logo } from "@/components/brand/logo";
import { AuthCard, Notice } from "@/components/auth/auth-card";
import { AuthForm } from "@/components/auth/auth-form";
import { VerifyForm } from "@/components/auth/verify-form";
import { AppShell } from "@/components/shell/app-shell";
import { Chat } from "@/components/shell/eddie-panel";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states/states";
import { ActionForm } from "@/components/ui/action-form";
import { Disclosure, Field, inputCls, Options } from "@/components/ui/fields";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { PERIOD_LABEL, PERIODS } from "@/server/reports";
import LoadingCuentas from "../../src/app/(app)/cuentas/loading";
import LoadingOverview from "../../src/app/(app)/overview/loading";
import * as F from "./fixtures";

export type Screen = { name: string; path: string; shell: boolean; node: React.ReactNode };
const noop = async () => undefined;

const overview = (
  <>
    <PageHeader title="Overview" description="Tu situación financiera de un vistazo. Cada moneda se calcula por separado." />
    <div className="mb-4 space-y-2">
      <PillNav label="Período" items={PERIODS.map((k) => ({ href: "#", text: PERIOD_LABEL[k], active: k === "30d" }))} />
      <PillNav label="Moneda" items={[{ href: "#", text: "Todas", active: true }, ...CURRENCIES.map((c) => ({ href: "#", text: c, active: false }))]} />
    </div>
    <nav aria-label="Acciones rápidas" className="mb-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {F.overview.quickLinks.map((q) => <Link key={q.href} href={q.href} className="btn btn-primary btn-sm">{q.label}</Link>)}
    </nav>
    <OverviewView d={F.overview} />
  </>
);

const overviewUsd = <OverviewView d={{ ...F.overview, currencies: ["USD"] }} />;

const totals = { DOP: F.netWorth.byCurrency.DOP.accounts, USD: F.netWorth.byCurrency.USD.accounts };
const cuentas = (
  <>
    <PageHeader title="Cuentas" description="Saldos = saldo inicial + movimientos. Cada moneda se totaliza por separado." />
    <AccountTotals totals={totals} consolidated={F.netWorth.consolidated!.figures.net} />
    <Disclosure id="nueva-cuenta" summary="Nueva cuenta" className="mb-6"><p className="text-sm">…</p></Disclosure>
    <ul className="ac-grid" aria-label="Cuentas activas">
      {F.accounts.filter((a) => a.status === "active").map((a) => <AccountItem key={a.id} a={a} />)}
      <li className="ac-item"><NewAccountTile href="/cuentas?nuevo=1#nueva-cuenta" /></li>
    </ul>
    <section aria-labelledby="archived" className="mt-8">
      <h2 id="archived" className="mb-3 section-title">Archivadas</h2>
      <ul className="ac-grid">{F.accounts.filter((a) => a.status === "archived").map((a) => <AccountItem key={a.id} a={a} />)}</ul>
    </section>
  </>
);
const cuentasVacio = (
  <>
    <PageHeader title="Cuentas" description="Saldos = saldo inicial + movimientos. Cada moneda se totaliza por separado." />
    <Disclosure id="nueva-cuenta" open summary="Nueva cuenta" className="mb-6"><p className="text-sm">…formulario…</p></Disclosure>
    <EmptyState title="Aún no tienes cuentas" description="Crea tu primera cuenta con el formulario de arriba para empezar a registrar movimientos." />
  </>
);

const acctOpts = F.accounts.filter((a) => a.status === "active").map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
const cats = [{ id: "c1", name: "Supermercado", kind: "expense" as const }, { id: "c2", name: "Transporte", kind: "expense" as const }, { id: "c3", name: "Salario", kind: "income" as const }];
const movimientos = (
  <>
    <PageHeader title="Movimientos" description="Historial de ingresos, gastos, transferencias y ajustes." />
    <div className="mb-4">
      <Disclosure summary="Nuevo movimiento">
        <MovementForm action={noop as never} today={F.TODAY} accounts={acctOpts} categories={cats} idp="new-any" />
      </Disclosure>
    </div>
    <FiltersForm action="/movimientos" sp={{}} showType accounts={acctOpts} categories={cats} />
    <MovementList items={F.movements} remove={{ action: () => noop as never, returnTo: "/movimientos" }} />
    <Pagination basePath="/movimientos" sp={{}} page={1} pageSize={25} total={F.movements.length} />
  </>
);

const loanHeader = (
  <PageHeader
    title="Préstamos y deudas"
    description="Prestar no es un gasto ni pedir prestado es un ingreso: solo el interés cuenta como ingreso o gasto. Cada moneda se totaliza por separado."
    actions={
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <Link href="#nuevo-prestamo" className="btn btn-primary">Presté dinero</Link>
        <Link href="#nuevo-prestamo" className="btn btn-primary">Me prestaron</Link>
      </div>
    }
  />
);
const prestamosNuevo = (
  <>
    {loanHeader}
    <Disclosure id="nuevo-prestamo" open summary="Nuevo préstamo o deuda" className="mb-6 scroll-mt-20">
      <ActionForm action={noop as never} submit="Registrar">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" id="ln-direction"><select id="ln-direction" defaultValue="receivable" className={inputCls}><Options items={[{ value: "receivable", label: "Presté dinero (me deben)" }, { value: "payable", label: "Me prestaron (debo)" }]} /></select></Field>
          <Field label="Persona o entidad" id="ln-counterparty"><input id="ln-counterparty" className={inputCls} /></Field>
          <Field label="Capital" id="ln-principal"><input id="ln-principal" placeholder="0.00" className={inputCls} /></Field>
          <Field label="Moneda" id="ln-currency"><select id="ln-currency" className={inputCls}><Options items={[{ value: "DOP", label: "DOP (peso dominicano)" }, { value: "USD", label: "USD (dólar)" }]} /></select></Field>
        </div>
      </ActionForm>
    </Disclosure>
    <ul className="grid gap-3 lg:grid-cols-2">{F.loans.filter((l) => l.direction === "receivable").map((l) => <LoanCard key={l.id} l={l} remove={noop as never} />)}</ul>
  </>
);
const prestamosList = (
  <>
    {loanHeader}
    <section aria-label="Resumen por moneda" className="mb-6 grid gap-3 sm:grid-cols-2">
      {CURRENCIES.map((c) => (
        <div key={c} className="card">
          <div className="mb-3 flex items-center justify-between"><span className="eyebrow">Resumen</span><span className="badge badge-info">{c}</span></div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-xs text-muted">Por cobrar</dt><dd className="amount text-lg pos">{formatMoney(F.overview.loans.receivable[c], c)}</dd></div>
            <div><dt className="text-xs text-muted">Por pagar</dt><dd className="amount text-lg neg">{formatMoney(F.overview.loans.payable[c], c)}</dd></div>
          </dl>
        </div>
      ))}
    </section>
    <nav aria-label="Tipo de préstamo" className="mb-4 flex gap-2">
      {[["cobrar", "Por cobrar"], ["pagar", "Por pagar"]].map(([t, label]) => (
        <Link key={t} href="#" aria-current={t === "cobrar" ? "page" : undefined}
          className="pill">{label}</Link>
      ))}
    </nav>
    <ul className="grid gap-3 lg:grid-cols-2">{F.loans.filter((l) => l.direction === "receivable").map((l) => <LoanCard key={l.id} l={l} remove={noop as never} />)}</ul>
  </>
);

const l0 = F.loans[1];
const prestamoDetalle = (
  <>
    <PageHeader title={l0.counterparty} description={`Me debe · ${l0.currency} · desde ${fmtDate(l0.startDate)} · vence ${fmtDate(l0.dueDate!)}`} />
    <div className="mb-4 flex flex-wrap gap-4 text-sm"><Link href="#" className="text-primary underline">← Volver a préstamos</Link></div>
    <section aria-label="Acciones del préstamo" className="mb-6 flex flex-wrap items-center gap-3">
      <RemoveLoanButton l={l0} action={noop as never} />
      <p className="text-sm text-muted">Para eliminar el préstamo, primero elimina sus pagos (abajo).</p>
    </section>
    <section className="mb-6 card">
      <h2 className="mb-3 section-title">Movimientos del préstamo</h2>
      <ul className="divide-y divide-border text-sm">
        <li className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">Cobro de préstamo · {fmtDate("2026-10-12")}</span><Link href="#" className="text-primary underline">Ver movimiento</Link></div>
          <p className="text-muted">Banco Popular · Capital {formatMoney(30000n, "USD")}</p>
          <div className="mt-2"><ConfirmActionDialog id="p1" triggerLabel="Eliminar pago" triggerAriaLabel="Eliminar pago" title="¿Eliminar este pago?" action={noop as never} /></div>
        </li>
      </ul>
    </section>
  </>
);

const overlay = (children: React.ReactNode) => (
  <>
    <div className="fixed inset-0 z-40 bg-[var(--overlay)]" />
    <div role="dialog" aria-label="Confirmación" className="fixed inset-0 z-50 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-pop)]">{children}</div>
  </>
);
const m0 = F.movements[0];
const dialogMovimiento = (
  <>{movimientos}{overlay(
    <ConfirmPanel staticPreview id="d1" title="¿Eliminar este movimiento?" askReason notice={VOID_NOTICE} confirmLabel="Eliminar" pendingLabel="Eliminando…">
      <p className="rounded-lg bg-surface-2 px-3 py-2.5"><strong className="block break-words">{m0.description}</strong><span className="text-muted">{fmtDate(m0.date)} · Banco Popular · </span><strong>-RD$4,825.40</strong></p>
    </ConfirmPanel>)}</>
);
const dialogPrestamo = (
  <>{prestamosList}{overlay(
    <ConfirmPanel staticPreview id="d2" title="¿Eliminar este préstamo?" askReason notice={`${VOID_NOTICE} El préstamo dejará de contar como por cobrar y el movimiento de dinero de su creación se revierte en la cuenta.`} confirmLabel="Eliminar préstamo" pendingLabel="Eliminando…">
      <p className="rounded-lg bg-surface-2 px-3 py-2.5"><strong className="block">María Fernández</strong><span className="text-muted">Me debe · capital </span><strong>RD$45,000.00</strong></p>
    </ConfirmPanel>)}</>
);
const dialogPrestamoBloqueado = (
  <>{prestamosList}{overlay(
    <ConfirmPanel staticPreview id="d3" title="¿Eliminar este préstamo?" blocked={<>Primero elimina los pagos de este préstamo. Los encuentras en <span className="font-semibold text-primary underline">el detalle del préstamo</span>.</>} notice="" confirmLabel="Eliminar préstamo" pendingLabel="">
      <p className="rounded-lg bg-surface-2 px-3 py-2.5"><strong className="block">Carlos Peña</strong><span className="text-muted">Me debe · capital </span><strong>US$1,500.00</strong></p>
    </ConfirmPanel>)}</>
);
const a0 = F.accounts[0];
const cuentaMenu = (
  <>
    <PageHeader title="Cuentas" description="Menú Acciones abierto." />
    <ul className="ac-grid"><li className="ac-item">
      <AccountCard uid="m1" name={a0.name} type={a0.type} currency={a0.currency} balanceMinor={a0.balanceMinor} />
      <div className="ac-tray">
        <div className="ac-meta"><p className="truncate text-sm">{a0.description}</p><p className="truncate text-xs text-muted">Saldo inicial RD$50,000.00 al 01/01/2026</p></div>
        <div className="ac-actions">
          <Link href="#" className="btn btn-primary ac-main">Ver movimientos</Link>
          <div className="ac-menu">
            <button type="button" className="btn btn-secondary ac-more" aria-expanded="true">Acciones</button>
            <ul className="ac-pop"><li><button type="button" className="ac-opt">Editar</button></li><li><button type="button" className="ac-opt">Archivar</button></li></ul>
          </div>
        </div>
      </div>
    </li></ul>
  </>
);
const cuentaArchivar = (
  <>{cuentas}{overlay(
    <ConfirmPanel staticPreview id="d4" title="¿Archivar «Banco Popular»?" askReason={false} notice="Las cuentas no se borran: al archivarla se conserva todo su historial y su saldo, ya no admite movimientos nuevos y puedes reactivarla cuando quieras." confirmLabel="Archivar cuenta" pendingLabel="">
      <p className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2.5">Esta cuenta tiene un saldo de <strong>RD$430,420.55</strong>.</p>
      <label className="check text-sm"><input type="checkbox" /> Confirmo archivar con saldo distinto de cero</label>
    </ConfirmPanel>)}</>
);

const patrimonio = (
  <>
    <PageHeader title="Patrimonio" description="Bienes con historial de valoraciones y patrimonio neto. Cada moneda se totaliza por separado; DOP y USD nunca se suman." />
    <nav aria-label="Moneda de consolidación" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Consolidar en:</span>
      {[["", "Sin consolidar"], ["DOP", "DOP"], ["USD", "USD"]].map(([b, label]) => (
        <Link key={b} href="#" aria-current={b === "DOP" ? "page" : undefined} className="pill">{label}</Link>
      ))}
    </nav>
    <NetWorthPanel nw={F.netWorth} />
    <section aria-labelledby="evo" className="mb-6 card">
      <h2 id="evo" className="mb-1 section-title">Evolución del patrimonio neto (12 meses)</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {CURRENCIES.map((c) => <Sparkline key={c} values={F.evolution.map((p) => p.byCurrency[c].net)} label={`Patrimonio neto en ${c} por mes`} />)}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="data-table compact">
          <caption className="sr-only">Patrimonio neto al cierre de cada mes, por moneda</caption>
          <thead><tr><th scope="col">Al cierre de</th>{CURRENCIES.map((c) => <th key={c} scope="col" className="num">Neto {c}</th>)}</tr></thead>
          <tbody>{F.evolution.slice(-6).map((p) => (
            <tr key={p.date}><th scope="row">{fmtDate(p.date)}</th>
              {CURRENCIES.map((c) => <td key={c} className="num">{formatMoney(p.byCurrency[c].net, c)}</td>)}</tr>))}</tbody>
        </table>
      </div>
    </section>
    {ASSET_TYPE_ORDER.map((t) => {
      const g = F.assets.filter((a) => a.type === t);
      return g.length === 0 ? null : (
        <section key={t} aria-labelledby={`g-${t}`} className="mb-6"><h2 id={`g-${t}`} className="mb-3 section-title">{ASSET_TYPE_LABEL[t]}</h2>
          <ul className="grid gap-3 lg:grid-cols-2">{g.map((a) => <AssetCard key={a.id} a={a} />)}</ul></section>
      );
    })}
  </>
);

const range = { from: "2026-10-29", to: F.TODAY };
const reportes = (
  <>
    <PageHeader title="Reportes" description="Cada moneda se reporta por separado; DOP y USD nunca se suman." />
    <div className="mb-4"><PillNav label="Reportes" items={["Ingresos vs gastos", "Flujo de caja", "Saldos por cuenta", "Gastos por categoría", "Préstamos y deudas", "Patrimonio", "Comparar períodos"].map((t, i) => ({ href: "#", text: t, active: i === 0 }))} /></div>
    <IncomeExpenseSection r={F.flow} />
    <div className="mt-6"><BalancesSection r={F.distribution} /></div>
  </>
);

const mercados = (
  <>
    <PageHeader title="Market Watch" description="Comportamiento del mercado, independiente de cualquier broker. Solo informativo: aquí no se compra ni se vende. Cada cotización indica su estado y la hora del proveedor." />
    <nav aria-label="Categorías" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
      {["Commodities", "Acciones", "Cripto", "Divisas", "Favoritos", "Mis listas"].map((t, i) => (
        <Link key={t} href="#" aria-current={i === 0 ? "page" : undefined} className="pill">{t}</Link>
      ))}
    </nav>
    <QuoteBoard initialRows={F.marketRows} loadedAt="2026-11-27T15:43:00Z" scope="category:commodities" />
  </>
);

const q0 = F.marketRows[2];
const simbolo = (
  <div className="space-y-4">
    <PageHeader title="Market Watch" description="Solo informativo." />
    <Link href="#" className="inline-block text-sm underline underline-offset-2">← Volver a la lista</Link>
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xl font-semibold">{fmtNum(q0.quote.price)}<span className="ml-1 text-sm font-normal text-muted">USD</span></p>
        <StatusBadge status={q0.quote.status} />
      </div>
      <p className="text-sm"><Change q={q0.quote} /></p>
      <p className="mt-1 text-xs text-muted">Apple Inc. · Hora del proveedor: {fmtTs(q0.quote.providerTs)} · Última actualización: {fmtTs(q0.quote.fetchedAt)} (America/Santo_Domingo)</p>
    </div>
    <SymbolDetail symbol="AAPL" name="Apple Inc." />
  </div>
);

const eddie = (
  <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-xl">
    <div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="section-title">Eddie</h2><p className="text-xs text-muted">Eddie propone, tú confirmas.</p></div></div>
    <Chat boot={{ configured: true, missing: [], messages: F.eddieMessages, proposals: [F.proposal] }} refresh={noop} />
  </div>
);

const login = (
  <AuthCard title="Iniciar sesión">
    <AuthForm action={noop as never} submit="Entrar" pending="Entrando…" fields={[
      { name: "email", label: "Correo electrónico", type: "email", autoComplete: "email" },
      { name: "password", label: "Contraseña", type: "password", autoComplete: "current-password" }]} />
  </AuthCard>
);
const accesoDenegado = (
  <AuthCard title="Acceso denegado">
    <p className="mb-4 text-sm">Tu cuenta no es la propietaria de esta instalación de Auto-Bank, por lo que no puedes ver sus datos.</p>
    <button type="button" className="btn btn-primary w-full">Cerrar sesión</button>
  </AuthCard>
);
const registro = (
  <AuthCard title="Crear cuenta propietaria">
    <AuthForm action={noop as never} submit="Crear cuenta" pending="Creando…" fields={[
      { name: "name", label: "Nombre", type: "text", autoComplete: "name" },
      { name: "email", label: "Correo electrónico", type: "email", autoComplete: "email" },
      { name: "password", label: "Contraseña", type: "password", autoComplete: "new-password" }]} />
  </AuthCard>
);
const verificar = (
  <AuthCard title="Verifica tu correo">
    <Notice>Te enviamos un código de 6 dígitos por correo. Ingresa el código para activar la cuenta de propietario. Vence en unos minutos.</Notice>
    <VerifyForm email="owner@example.com" />
    <p className="mt-4 text-sm"><Link href="/login" className="font-medium text-primary underline">Volver a iniciar sesión</Link></p>
  </AuthCard>
);

const logoSheet = (
  <div className="space-y-6 p-6">
    <div className="flex flex-wrap items-center gap-6 rounded-xl bg-[#102a43] p-6"><Logo variant="mark" size={96} /><Logo variant="horizontal" size={64} /><Logo variant="horizontal" size={36} /><Logo variant="mark" size={32} /></div>
    <div className="flex flex-wrap items-center gap-6 rounded-xl bg-white p-6"><Logo variant="mark" panel size={96} /><Logo variant="horizontal" panel size={64} /><Logo variant="horizontal" panel size={40} /><Logo variant="mark" panel size={32} /><Logo variant="mark" panel size={16} /></div>
    <div className="flex justify-center"><Logo variant="full" size={420} /></div>
  </div>
);

export const SCREENS: Screen[] = [
  { name: "logo", path: "/overview", shell: false, node: logoSheet },
  { name: "overview", path: "/overview", shell: true, node: overview },
  { name: "overview-usd", path: "/overview", shell: true, node: overviewUsd },
  { name: "cuentas", path: "/cuentas", shell: true, node: cuentas },
  { name: "loading-cuentas", path: "/cuentas", shell: true, node: <LoadingCuentas /> },
  { name: "loading-overview", path: "/overview", shell: true, node: <LoadingOverview /> },
  { name: "cuentas-vacio", path: "/cuentas", shell: true, node: cuentasVacio },
  { name: "prestamos-nuevo", path: "/prestamos", shell: true, node: prestamosNuevo },
  { name: "movimientos", path: "/movimientos", shell: true, node: movimientos },
  { name: "prestamos", path: "/prestamos", shell: true, node: prestamosList },
  { name: "dialog-movimiento", path: "/movimientos", shell: true, node: dialogMovimiento },
  { name: "dialog-prestamo", path: "/prestamos", shell: true, node: dialogPrestamo },
  { name: "dialog-prestamo-bloqueado", path: "/prestamos", shell: true, node: dialogPrestamoBloqueado },
  { name: "cuenta-menu", path: "/cuentas", shell: true, node: cuentaMenu },
  { name: "dialog-archivar", path: "/cuentas", shell: true, node: cuentaArchivar },
  { name: "prestamo-detalle", path: "/prestamos", shell: true, node: prestamoDetalle },
  { name: "patrimonio", path: "/patrimonio", shell: true, node: patrimonio },
  { name: "reportes", path: "/reportes", shell: true, node: reportes },
  { name: "mercados", path: "/mercados", shell: true, node: mercados },
  { name: "simbolo", path: "/mercados", shell: true, node: simbolo },
  { name: "eddie", path: "/overview", shell: true, node: <>{overview}{eddie}</> },
  { name: "login", path: "/login", shell: false, node: login },
  { name: "verificar", path: "/verificar", shell: false, node: verificar },
  { name: "acceso-denegado", path: "/acceso-denegado", shell: false, node: accesoDenegado },
  { name: "registro", path: "/registro", shell: false, node: registro },
];
export { AppShell };
void range; void IncomeExpenseSection; void NetWorthSection; void ComparisonSection;
