import { addDays, todayDR } from "@/lib/dates";
import { CURRENCIES, emptyTotals, type Currency, type TotalsByCurrency } from "@/lib/money";
import { totalsByCurrency, listAccounts, type AccountType } from "./accounts";
import { netWorth, netWorthEvolution, type NetWorth, type NetWorthLine } from "./assets";
import type { Executor, Row } from "./executor";
import { listMovements, type MovementRow } from "./ledger";
import { listDueLoans, loanSummary, type LoanRow, type LoanSummary } from "./loans";
import { reportFiltersSchema, type ReportFilters } from "./schemas";

/*
 * Read-only reporting services. Rules that hold for every function here:
 *  - Aggregation happens in SQL, parametrised, and every query is scoped by user_id.
 *  - EVERYTHING is per currency. DOP and USD are never added; there is no consolidated figure in this module
 *    (a consolidated view lives in fx.consolidate(), used by netWorth when a base currency is asked for).
 *  - Income/expense come from the flow_entries view: transfers, adjustments and loan principal are NOT income/expense;
 *    loan interest is income on a receivable and expense on a payable. Reversals carry the original's date and the
 *    opposite sign, so they net out inside any period that contains the original.
 *  - Cancelled loans never count.
 */

export type Granularity = "day" | "week" | "month";
export interface Range { from: string; to: string }
export interface ResolvedFilters extends Range { currency?: Currency; accountId?: string; granularity: Granularity }

const currenciesOf = (c?: Currency): Currency[] => (c ? [c] : [...CURRENCIES]);

/** Zod-validated filters -> concrete range. Default: the last 30 days (today included). */
export function resolveFilters(raw: ReportFilters = {}, today = todayDR()): ResolvedFilters {
  const f = reportFiltersSchema.parse(raw);
  const to = f.dateTo ?? today;
  return { from: f.dateFrom ?? addDays(to, -29), to, currency: f.currency, accountId: f.accountId, granularity: f.granularity };
}

/** The equally long period immediately before `r` (used as the base of a comparison). */
export function previousRange(r: Range): Range {
  const days = Math.round((Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86_400_000) + 1;
  return { from: addDays(r.from, -days), to: addDays(r.from, -1) };
}

/** Parametrised WHERE for a relation aliased `a` that has user_id, date, currency, account_id. */
function scope(alias: string, userId: string, f: { from: string; to: string; currency?: Currency; accountId?: string }, params: unknown[] = []) {
  params.push(userId);
  const where = [`${alias}.user_id = $${params.length}`];
  const p = (v: unknown) => (params.push(v), `$${params.length}`);
  where.push(`${alias}.date >= ${p(f.from)}::date`, `${alias}.date <= ${p(f.to)}::date`);
  if (f.currency) where.push(`${alias}.currency::text = ${p(f.currency)}`);
  if (f.accountId) where.push(`${alias}.account_id = ${p(f.accountId)}`);
  return { where: where.join(" and "), params, p };
}

/** ISO week (Monday start) / calendar month / day, as YYYY-MM-DD of the bucket start. */
const bucketSql = (alias: string, g: string) => `to_char(date_trunc(${g}::text, ${alias}.date::timestamp), 'YYYY-MM-DD')`;

/** Largest-remainder allocation in permille (tenths of a percent): positive amounts only; the result always sums to 1000. */
export function allocateShares(amounts: readonly bigint[]): number[] {
  const total = amounts.reduce((a, b) => a + b, 0n);
  if (total <= 0n) return amounts.map(() => 0);
  const base = amounts.map((a) => (a * 1000n) / total);
  const rem = amounts.map((a, i) => ({ i, r: (a * 1000n) % total }));
  let left = 1000 - Number(base.reduce((a, b) => a + b, 0n));
  rem.sort((x, y) => (x.r === y.r ? x.i - y.i : x.r > y.r ? -1 : 1));
  const out = base.map(Number);
  for (const { i } of rem) { if (left-- <= 0) break; out[i] += 1; }
  return out;
}

// ---- income vs expense ----------------------------------------------------------

export interface FlowPoint { bucket: string; incomeMinor: bigint; expenseMinor: bigint; netMinor: bigint }
export interface IncomeVsExpenseCurrency { currency: Currency; series: FlowPoint[]; incomeMinor: bigint; expenseMinor: bigint; netMinor: bigint }
export interface IncomeVsExpense { range: Range; granularity: Granularity; byCurrency: IncomeVsExpenseCurrency[] }

/** Ingresos y gastos por período (expense is shown as a positive magnitude; net = income - expense). Empty buckets are omitted. */
export async function incomeVsExpense(ex: Executor, userId: string, raw: ReportFilters = {}): Promise<IncomeVsExpense> {
  const f = resolveFilters(raw);
  const s = scope("f", userId, f);
  const r = await ex.query(
    `select f.currency::text as currency, ${bucketSql("f", s.p(f.granularity))} as bucket,
            sum(case when f.flow = 'income'  then f.amount_minor else 0 end)::text as income,
            sum(case when f.flow = 'expense' then f.amount_minor else 0 end)::text as expense
     from flow_entries f where ${s.where}
     group by 1, 2 order by 1, 2`,
    s.params,
  );
  const byCurrency = currenciesOf(f.currency).map((currency): IncomeVsExpenseCurrency => {
    const series = r.rows.filter((x) => x.currency === currency).map((x) => {
      const incomeMinor = BigInt(x.income as string), expenseMinor = BigInt(x.expense as string);
      return { bucket: x.bucket as string, incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor };
    });
    const incomeMinor = series.reduce((a, p) => a + p.incomeMinor, 0n), expenseMinor = series.reduce((a, p) => a + p.expenseMinor, 0n);
    return { currency, series, incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor };
  });
  return { range: { from: f.from, to: f.to }, granularity: f.granularity, byCurrency };
}

// ---- cash flow ------------------------------------------------------------------

/**
 * FLUJO DE CAJA = net change of the money held in accounts over the period, per currency:
 *     ingresos - gastos + capital de préstamos + ajustes (+ transferencias)
 * where
 *   income / expense   come from flow_entries (loan interest included; expense is a NEGATIVE contribution here),
 *   loanPrincipal      is the signed principal movement (lending out = negative, collecting = positive, borrowing = positive...),
 *   adjustments        are signed balance corrections,
 *   transfersInternal  are same-currency transfers: they net to ZERO across accounts (only non-zero when an account filter
 *                      shows one side of the transfer),
 *   transfersFx        are cross-currency transfers (the transaction has entries in more than one currency). Shown as their own
 *                      line: each currency sees only its own leg, never a converted amount.
 * By construction net = SUM(entries.amount_minor) for the same filters, which the tests assert.
 */
export const CASH_LINES = ["income", "expense", "loanPrincipal", "adjustments", "transfersInternal", "transfersFx"] as const;
export type CashLine = (typeof CASH_LINES)[number];
export type CashLines = Record<CashLine, bigint>;
export interface CashFlowPoint { bucket: string; lines: CashLines; netMinor: bigint }
export interface CashFlowCurrency { currency: Currency; lines: CashLines; netMinor: bigint; series: CashFlowPoint[] }
export interface CashFlow { range: Range; granularity: Granularity; byCurrency: CashFlowCurrency[] }

const emptyLines = (): CashLines => ({ income: 0n, expense: 0n, loanPrincipal: 0n, adjustments: 0n, transfersInternal: 0n, transfersFx: 0n });
const sumLines = (l: CashLines) => CASH_LINES.reduce((a, k) => a + l[k], 0n);

export async function cashFlow(ex: Executor, userId: string, raw: ReportFilters = {}): Promise<CashFlow> {
  const f = resolveFilters(raw);
  const s1 = scope("f", userId, f);
  const g1 = s1.p(f.granularity);
  const s2 = scope("e", userId, f);
  const g2 = s2.p(f.granularity);
  const [flow, other] = await Promise.all([
    ex.query(
      `select f.currency::text as currency, ${bucketSql("f", g1)} as bucket, f.flow as line,
              sum(case when f.flow = 'income' then f.amount_minor else -f.amount_minor end)::text as amt
       from flow_entries f where ${s1.where} group by 1, 2, 3`,
      s1.params,
    ),
    ex.query(
      `select e.currency::text as currency, ${bucketSql("e", g2)} as bucket,
              case e.kind when 'loan_principal' then 'loanPrincipal' when 'adjustment' then 'adjustments'
                else case when exists (select 1 from entries x where x.transaction_id = e.transaction_id and x.currency <> e.currency)
                          then 'transfersFx' else 'transfersInternal' end end as line,
              sum(e.amount_minor)::text as amt
       from entries e where ${s2.where} and e.kind in ('loan_principal', 'adjustment', 'transfer') group by 1, 2, 3`,
      s2.params,
    ),
  ]);
  const rows: Row[] = [...flow.rows, ...other.rows];
  const byCurrency = currenciesOf(f.currency).map((currency): CashFlowCurrency => {
    const buckets = new Map<string, CashLines>();
    const lines = emptyLines();
    for (const x of rows) {
      if (x.currency !== currency) continue;
      const amt = BigInt(x.amt as string), line = x.line as CashLine;
      const b = buckets.get(x.bucket as string) ?? emptyLines();
      b[line] += amt; lines[line] += amt;
      buckets.set(x.bucket as string, b);
    }
    const series = [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([bucket, l]) => ({ bucket, lines: l, netMinor: sumLines(l) }));
    return { currency, lines, netMinor: sumLines(lines), series };
  });
  return { range: { from: f.from, to: f.to }, granularity: f.granularity, byCurrency };
}

// ---- balances by account --------------------------------------------------------

export interface AccountBalanceRow { accountId: string; name: string; type: AccountType; currency: Currency; status: "active" | "archived"; balanceMinor: bigint; shareOfActivePermille: number }
export interface BalancesByAccount {
  asOf: string;
  rows: AccountBalanceRow[];
  /** Sum of ACTIVE accounts per currency (the "disponible"); archived accounts are listed only while they still hold a balance. */
  activeTotals: TotalsByCurrency;
}

/** Balance of each account at the end of `asOf`: opening + entries dated <= asOf (equals the account_balances view for a date past the last entry). */
export async function balancesByAccount(ex: Executor, userId: string, opts: { asOf?: string; currency?: Currency } = {}): Promise<BalancesByAccount> {
  const asOf = opts.asOf ?? todayDR();
  const params: unknown[] = [userId, asOf];
  let cur = "";
  if (opts.currency) { params.push(opts.currency); cur = `and a.currency::text = $3`; }
  const r = await ex.query(
    `select a.id, a.name, a.type::text as type, a.currency::text as currency, a.status::text as status,
            (a.opening_balance_minor + coalesce((select sum(e.amount_minor) from entries e where e.account_id = a.id and e.user_id = $1 and e.date <= $2::date), 0))::text as bal
     from accounts a where a.user_id = $1 and a.opening_date <= $2::date ${cur} order by a.currency, a.name`,
    params,
  );
  const rows = r.rows
    .map((x) => ({ accountId: x.id as string, name: x.name as string, type: x.type as AccountType, currency: x.currency as Currency, status: x.status as "active" | "archived", balanceMinor: BigInt(x.bal as string), shareOfActivePermille: 0 }))
    .filter((x) => x.status === "active" || x.balanceMinor !== 0n);
  const activeTotals = emptyTotals();
  for (const x of rows) if (x.status === "active") activeTotals[x.currency] += x.balanceMinor;
  for (const c of CURRENCIES) {
    // Share of the currency's total among active accounts with a positive balance (a pie of money you hold).
    const pos = rows.filter((x) => x.currency === c && x.status === "active" && x.balanceMinor > 0n);
    allocateShares(pos.map((x) => x.balanceMinor)).forEach((sh, i) => { pos[i].shareOfActivePermille = sh; });
  }
  return { asOf, rows, activeTotals };
}

// ---- expenses by category -------------------------------------------------------

export interface CategoryExpense { categoryId: string | null; name: string; amountMinor: bigint; sharePermille: number }
export interface ExpensesByCategory { range: Range; byCurrency: { currency: Currency; totalMinor: bigint; items: CategoryExpense[] }[] }

export const LOAN_INTEREST_LABEL = "Interés de préstamos";

/** Net expense per category (reversals netted); the interest paid on payables has no category and is its own row. Shares sum to exactly 100% per currency. */
export async function expensesByCategory(ex: Executor, userId: string, raw: ReportFilters = {}): Promise<ExpensesByCategory> {
  const f = resolveFilters(raw);
  const s = scope("f", userId, f);
  const r = await ex.query(
    `select f.currency::text as currency, c.id as category_id, coalesce(c.name, '${LOAN_INTEREST_LABEL}') as name, sum(f.amount_minor)::text as amt
     from flow_entries f
     join entries e on e.id = f.entry_id
     join transactions t on t.id = e.transaction_id
     left join categories c on c.id = t.category_id and c.user_id = f.user_id
     where ${s.where} and f.flow = 'expense'
     group by 1, 2, 3 having sum(f.amount_minor) > 0
     order by 1, sum(f.amount_minor) desc, 3`,
    s.params,
  );
  const byCurrency = currenciesOf(f.currency).map((currency) => {
    const rows = r.rows.filter((x) => x.currency === currency);
    const amounts = rows.map((x) => BigInt(x.amt as string));
    const shares = allocateShares(amounts);
    return {
      currency, totalMinor: amounts.reduce((a, b) => a + b, 0n),
      items: rows.map((x, i): CategoryExpense => ({ categoryId: (x.category_id as string | null) ?? null, name: x.name as string, amountMinor: amounts[i], sharePermille: shares[i] })),
    };
  });
  return { range: { from: f.from, to: f.to }, byCurrency };
}

// ---- loans ------------------------------------------------------------------------

export interface PendingBlock { count: number; outstandingMinor: bigint }
export interface LoansReportCurrency {
  currency: Currency;
  /** Outstanding principal NOW (not period-bound). */
  receivable: PendingBlock; payable: PendingBlock;
  /** Subset of the above whose due date has passed (status 'vencido'). */
  overdueReceivable: PendingBlock; overduePayable: PendingBlock;
  /** Interest recorded in the period (reversals netted): collected on receivables, paid on payables. */
  interestCollectedMinor: bigint; interestPaidMinor: bigint;
}
export interface LoansReport { range: Range; byCurrency: LoansReportCurrency[] }

/** Pendientes por cobrar / por pagar, vencidos and period interest. Cancelled loans are excluded everywhere. */
export async function loansReport(ex: Executor, userId: string, raw: ReportFilters = {}): Promise<LoansReport> {
  const f = resolveFilters(raw);
  const params: unknown[] = [userId];
  let cur = "";
  if (f.currency) { params.push(f.currency); cur = `and b.currency::text = $2`; }
  const s = scope("e", userId, { ...f, accountId: undefined });
  const [pending, interest] = await Promise.all([
    ex.query(
      `select b.direction::text as direction, b.currency::text as currency,
              count(*) filter (where b.outstanding_minor > 0)::int as n, coalesce(sum(b.outstanding_minor), 0)::text as outstanding,
              count(*) filter (where b.status = 'vencido')::int as n_over,
              coalesce(sum(b.outstanding_minor) filter (where b.status = 'vencido'), 0)::text as over
       from loan_balances b where b.user_id = $1 and b.cancelled_at is null ${cur} group by 1, 2`,
      params,
    ),
    ex.query(
      `select l.direction::text as direction, e.currency::text as currency, sum(e.amount_minor)::text as amt
       from entries e join transactions t on t.id = e.transaction_id join loans l on l.id = t.loan_id and l.user_id = e.user_id
       where ${s.where} and e.kind = 'loan_interest' and l.cancelled_at is null group by 1, 2`,
      s.params,
    ),
  ]);
  const byCurrency = currenciesOf(f.currency).map((currency): LoansReportCurrency => {
    const blk = (direction: string, over: boolean): PendingBlock => {
      const x = pending.rows.find((p) => p.direction === direction && p.currency === currency);
      return x ? { count: Number(over ? x.n_over : x.n), outstandingMinor: BigInt((over ? x.over : x.outstanding) as string) } : { count: 0, outstandingMinor: 0n };
    };
    const int = (direction: string) => {
      const x = interest.rows.find((p) => p.direction === direction && p.currency === currency);
      return x ? BigInt(x.amt as string) : 0n;
    };
    return {
      currency, receivable: blk("receivable", false), payable: blk("payable", false),
      overdueReceivable: blk("receivable", true), overduePayable: blk("payable", true),
      interestCollectedMinor: int("receivable"), interestPaidMinor: -int("payable"),
    };
  });
  return { range: { from: f.from, to: f.to }, byCurrency };
}

// ---- net worth --------------------------------------------------------------------

export interface NetWorthReport { current: NetWorth; evolution: { date: string; byCurrency: Record<Currency, NetWorthLine> }[] }

/** Reuses the patrimonio services: current figures plus month-end evolution (see netWorthEvolution for its stated limitation). */
export async function netWorthReport(ex: Executor, userId: string, opts: { months?: number; baseCurrency?: Currency } = {}): Promise<NetWorthReport> {
  const [current, evolution] = await Promise.all([netWorth(ex, userId, { baseCurrency: opts.baseCurrency }), netWorthEvolution(ex, userId, opts.months ?? 12)]);
  return { current, evolution };
}

// ---- compare periods --------------------------------------------------------------

export interface Variation {
  a: bigint; b: bigint;
  /** b - a. */
  absMinor: bigint;
  /** (b - a) / |a| in tenths of a percent (1234n = 123.4%); null when a = 0 (undefined, shown as "—"). */
  pctTenths: bigint | null;
}

/** Variation of period B relative to base period A. Division by zero yields an explicit null, never Infinity/NaN. */
export function variation(a: bigint, b: bigint): Variation {
  const abs = b - a;
  if (a === 0n) return { a, b, absMinor: abs, pctTenths: null };
  const d = a < 0n ? -a : a;
  const n = abs * 1000n;
  const neg = n < 0n;
  const q = (2n * (neg ? -n : n) + d) / (2n * d); // half away from zero
  return { a, b, absMinor: abs, pctTenths: neg ? -q : q };
}

export interface PeriodComparison {
  a: Range; b: Range;
  byCurrency: { currency: Currency; income: Variation; expense: Variation; net: Variation }[];
}

export async function comparePeriods(
  ex: Executor, userId: string, opts: { a: Range; b: Range; currency?: Currency; accountId?: string },
): Promise<PeriodComparison> {
  const mk = (r: Range) => incomeVsExpense(ex, userId, { dateFrom: r.from, dateTo: r.to, currency: opts.currency, accountId: opts.accountId, granularity: "month" });
  const [ra, rb] = await Promise.all([mk(opts.a), mk(opts.b)]);
  const byCurrency = ra.byCurrency.map((x, i) => {
    const y = rb.byCurrency[i];
    return { currency: x.currency, income: variation(x.incomeMinor, y.incomeMinor), expense: variation(x.expenseMinor, y.expenseMinor), net: variation(x.netMinor, y.netMinor) };
  });
  return { a: opts.a, b: opts.b, byCurrency };
}

// ---- overview ---------------------------------------------------------------------

export const PERIODS = ["7d", "30d", "90d", "mes", "anio"] as const;
export type PeriodKey = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<PeriodKey, string> = { "7d": "7 días", "30d": "30 días", "90d": "90 días", mes: "Mes actual", anio: "Año" };

export function periodRange(key: PeriodKey, today = todayDR()): Range & { granularity: Granularity } {
  switch (key) {
    case "7d": return { from: addDays(today, -6), to: today, granularity: "day" };
    case "30d": return { from: addDays(today, -29), to: today, granularity: "day" };
    case "90d": return { from: addDays(today, -89), to: today, granularity: "week" };
    case "mes": return { from: `${today.slice(0, 8)}01`, to: today, granularity: "day" };
    case "anio": return { from: `${today.slice(0, 4)}-01-01`, to: today, granularity: "month" };
  }
}

export const QUICK_LINKS = [
  { href: "/ingresos", label: "Nuevo ingreso" },
  { href: "/gastos", label: "Nuevo gasto" },
  { href: "/transferencias", label: "Nueva transferencia" },
  { href: "/prestamos?nuevo=receivable#nuevo-prestamo", label: "Nuevo préstamo" },
  { href: "/prestamos", label: "Registrar pago de préstamo" },
] as const;

export interface Overview {
  period: { key: PeriodKey; from: string; to: string; granularity: Granularity };
  /** Currencies shown (the filter, or both). Every per-currency figure below has an entry for each of them only. */
  currencies: Currency[];
  netWorth: NetWorth;
  /**
   * DISPONIBLE = sum of the balances of ACTIVE accounts, every type included (efectivo, banco, ahorro, digital), per currency.
   * Excludes archived accounts, assets and loans. (Patrimonio neto, in contrast, also counts archived balances, assets and loans.)
   */
  disponible: TotalsByCurrency;
  loans: LoanSummary;
  flow: IncomeVsExpense;
  distribution: BalancesByAccount;
  due: LoanRow[];
  recent: MovementRow[];
  quickLinks: typeof QUICK_LINKS;
}

export async function overviewData(ex: Executor, userId: string, opts: { period?: PeriodKey; currency?: Currency } = {}, today = todayDR()): Promise<Overview> {
  const key = opts.period ?? "30d";
  const range = periodRange(key, today);
  const [nw, accounts, loans, flow, distribution, due, recent] = await Promise.all([
    netWorth(ex, userId),
    listAccounts(ex, userId),
    loanSummary(ex, userId),
    incomeVsExpense(ex, userId, { dateFrom: range.from, dateTo: range.to, currency: opts.currency, granularity: range.granularity }),
    balancesByAccount(ex, userId, { currency: opts.currency }),
    listDueLoans(ex, userId, 30),
    listMovements(ex, userId, { currency: opts.currency, pageSize: 10 }),
  ]);
  return {
    period: { key, ...range }, currencies: currenciesOf(opts.currency), netWorth: nw, disponible: totalsByCurrency(accounts), loans, flow, distribution,
    due: opts.currency ? due.filter((l) => l.currency === opts.currency) : due, recent: recent.items, quickLinks: QUICK_LINKS,
  };
}
