import { emptyTotals, formatMoney, type Currency, type TotalsByCurrency } from "@/lib/money";
import { audit } from "./audit";
import { getAccount, type AccountWithBalance } from "./accounts";
import { DomainError, isUniqueViolation, notFound } from "./errors";
import type { Executor, Query, Row } from "./executor";
import { lockOriginal, markReversed, postTransaction, reverse, type AuditEntry, type Leg } from "./ledger";
import {
  idSchema, loanCreateSchema, loanFiltersSchema, loanPaymentSchema,
  type LoanCreateInput, type LoanFilters, type LoanPaymentInput,
} from "./schemas";

export type LoanDirection = "receivable" | "payable";
export type LoanStatus = "pendiente" | "parcial" | "liquidado" | "vencido";

export interface LoanRow {
  id: string; direction: LoanDirection; counterparty: string; currency: Currency;
  principalMinor: bigint; principalPaidMinor: bigint; interestPaidMinor: bigint; outstandingMinor: bigint;
  /** Derived by the loan_balances view; never stored. */
  status: LoanStatus;
  startDate: string; dueDate: string | null; interestRatePct: string | null;
  accountId: string | null; accountName: string | null; funded: boolean; notes: string | null; createdAt: string;
}

// ---- writes -------------------------------------------------------------------

async function usableAccount(q: Query, userId: string, id: string, currency: Currency): Promise<AccountWithBalance> {
  const a = await getAccount(q, userId, id);
  if (a.status === "archived") throw new DomainError("ACCOUNT_ARCHIVED", `La cuenta "${a.name}" está archivada y no admite movimientos.`);
  if (a.currency !== currency) {
    throw new DomainError("CURRENCY_MISMATCH", `La cuenta "${a.name}" está en ${a.currency} y el préstamo en ${currency}; las monedas no se mezclan.`);
  }
  return a;
}

const loanByKey = async (q: Query, userId: string, key: string) =>
  ((await q(`select id from loans where user_id = $1 and idempotency_key = $2`, [userId, key])).rows[0]?.id as string | undefined) ?? null;

/**
 * Registers a loan in ONE DB transaction. Funded: the initial money movement (loan_disbursement for a
 * receivable, loan_proceeds for a payable) is posted with it. Unfunded: pre-existing debt, no movement.
 * Lending is not an expense and borrowing is not income: both are loan_principal legs.
 */
export async function createLoan(ex: Executor, userId: string, raw: LoanCreateInput): Promise<{ id: string; duplicate: boolean }> {
  const i = loanCreateSchema.parse(raw);
  const key = i.idempotencyKey;
  try {
    return await ex.transaction(async (q) => {
      if (key) {
        const existing = await loanByKey(q, userId, key);
        if (existing) return { id: existing, duplicate: true };
      }
      const account = i.accountId ? await usableAccount(q, userId, i.accountId, i.currency) : null;
      const r = await q(
        `insert into loans (user_id, direction, counterparty, principal_minor, currency, start_date, due_date,
                            interest_rate_pct, account_id, funded_from_account, notes, idempotency_key)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [userId, i.direction, i.counterparty, i.principal.toString(), i.currency, i.startDate, i.dueDate ?? null,
          i.interestRatePct ?? null, account?.id ?? null, i.funded, i.notes ?? null, key ?? null],
      );
      const id = r.rows[0].id as string;
      let txnId: string | null = null;
      if (i.funded && account) {
        const receivable = i.direction === "receivable";
        txnId = await postTransaction(q, userId, {
          type: receivable ? "loan_disbursement" : "loan_proceeds", loanId: id, date: i.startDate,
          description: receivable ? `Préstamo a ${i.counterparty}` : `Préstamo de ${i.counterparty}`,
          notes: i.notes,
          legs: [{ accountId: account.id, currency: i.currency, kind: "loan_principal", amountMinor: receivable ? -i.principal : i.principal }],
        });
      }
      await audit(q, userId, "loan.create", "loan", id, null, { ...i, accountId: account?.id ?? null, transactionId: txnId });
      return { id, duplicate: false };
    });
  } catch (e) {
    if (key && isUniqueViolation(e)) {
      const existing = await loanByKey(ex.query, userId, key); // lost a race with the same key
      if (existing) return { id: existing, duplicate: true };
    }
    throw e;
  }
}

/**
 * Collection (receivable, money in) or repayment (payable, money out) with principal and/or interest legs.
 * The DB trigger only checks overpayment at COMMIT (READ COMMITTED), so two concurrent payments could both pass.
 * Hence the loan row is locked FIRST and the outstanding amount is re-read inside the lock.
 */
export async function registerPayment(ex: Executor, userId: string, loanId: string, raw: LoanPaymentInput): Promise<{ id: string; duplicate: boolean }> {
  const i = loanPaymentSchema.parse(raw);
  const key = i.idempotencyKey;
  if (!idSchema.safeParse(loanId).success) throw notFound("Préstamo");
  const byKey = async (q: Query) =>
    ((await q(`select id from transactions where user_id = $1 and idempotency_key = $2`, [userId, key]))).rows[0]?.id as string | undefined;
  try {
    return await ex.transaction(async (q) => {
      const l = await q(
        `select direction::text as direction, currency::text as currency, counterparty, start_date::text as start_date
         from loans where id = $1 and user_id = $2 for update`,
        [loanId, userId],
      );
      if (!l.rows[0]) throw notFound("Préstamo");
      const loan = l.rows[0] as { direction: LoanDirection; currency: Currency; counterparty: string; start_date: string };
      if (key) {
        const existing = await byKey(q);
        if (existing) return { id: existing, duplicate: true };
      }
      if (i.date < loan.start_date) throw new DomainError("BEFORE_START", "El pago no puede ser anterior a la fecha de inicio del préstamo.");
      const account = await usableAccount(q, userId, i.accountId, loan.currency);
      if (i.principal !== undefined) {
        const outstanding = BigInt((await q(`select outstanding_minor::text as o from loan_balances where loan_id = $1`, [loanId])).rows[0].o as string);
        if (i.principal > outstanding) {
          throw new DomainError("OVERPAYMENT",
            `El capital (${formatMoney(i.principal, loan.currency)}) excede el saldo pendiente (${formatMoney(outstanding, loan.currency)}).`);
        }
      }
      const receivable = loan.direction === "receivable";
      const sign = receivable ? 1n : -1n;
      const legs: Leg[] = [];
      if (i.principal !== undefined) legs.push({ accountId: account.id, currency: loan.currency, kind: "loan_principal", amountMinor: sign * i.principal });
      if (i.interest !== undefined) legs.push({ accountId: account.id, currency: loan.currency, kind: "loan_interest", amountMinor: sign * i.interest });
      const id = await postTransaction(q, userId, {
        type: receivable ? "loan_collection" : "loan_repayment", loanId, date: i.date,
        description: receivable ? `Cobro de ${loan.counterparty}` : `Pago a ${loan.counterparty}`,
        notes: i.notes, idempotencyKey: key, legs,
      });
      await audit(q, userId, "loan.payment", "loan", loanId, null, {
        transactionId: id, accountId: account.id, date: i.date,
        principalMinor: i.principal ?? 0n, interestMinor: i.interest ?? 0n,
      });
      return { id, duplicate: false };
    });
  } catch (e) {
    if (key && isUniqueViolation(e)) {
      const existing = await byKey(ex.query);
      if (existing) return { id: existing, duplicate: true };
    }
    throw e;
  }
}

/** Serialises per loan (same lock as payments), then locks the movement and checks it belongs to the user and has an allowed type. */
async function lockLoanMovement(q: Query, userId: string, txnId: string, types: readonly string[], label: string) {
  const pre = idSchema.safeParse(txnId).success
    ? await q(`select loan_id from transactions where id = $1 and user_id = $2`, [txnId, userId])
    : { rows: [] as Row[] };
  const loanId = pre.rows[0]?.loan_id as string | undefined;
  if (!loanId) throw notFound(label);
  await q(`select id from loans where id = $1 and user_id = $2 for update`, [loanId, userId]);
  const o = await lockOriginal(q, userId, txnId);
  if (o.type === "reversal") throw new DomainError("IS_REVERSAL", "Una reversa no se puede anular.");
  if (!types.includes(o.type)) throw new DomainError("WRONG_TYPE", `Este movimiento no es ${label === "Pago" ? "un pago" : "el desembolso inicial"} del préstamo.`);
  if (o.status === "reversed") throw new DomainError("ALREADY_REVERSED", "Este movimiento ya fue anulado.");
  return { o, loanId };
}

async function voidLoanTxn(q: Query, userId: string, o: Awaited<ReturnType<typeof lockLoanMovement>>["o"], loanId: string, action: string, reason?: string) {
  const reversalId = await reverse(q, userId, o, reason);
  await markReversed(q, userId, o.id, null);
  await audit(q, userId, "txn.void", "transaction", o.id, { status: "posted" }, { status: "reversed", reversalId, reason: reason ?? null });
  await audit(q, userId, action, "loan", loanId, { transactionId: o.id }, { reversalId, reason: reason ?? null });
  return reversalId;
}

/** Exact negation of a collection/repayment: restores the outstanding amount and nets its entries to zero. */
export async function voidPayment(ex: Executor, userId: string, paymentTxnId: string, reason?: string) {
  const note = reason?.trim().slice(0, 1000) || undefined;
  return ex.transaction(async (q) => {
    const { o, loanId } = await lockLoanMovement(q, userId, paymentTxnId, ["loan_collection", "loan_repayment"], "Pago");
    return { reversalId: await voidLoanTxn(q, userId, o, loanId, "loan.payment_void", note) };
  });
}

/**
 * Voids the initial disbursement/proceeds, only while the loan has no active payments. The loan record stays
 * (as unfunded: the money movement no longer exists), so nothing is deleted.
 */
export async function voidLoanOrigination(ex: Executor, userId: string, originTxnId: string, reason?: string) {
  const note = reason?.trim().slice(0, 1000) || undefined;
  return ex.transaction(async (q) => {
    const { o, loanId } = await lockLoanMovement(q, userId, originTxnId, ["loan_disbursement", "loan_proceeds"], "Desembolso");
    const n = Number((await q(
      `select count(*)::int as n from transactions where loan_id = $1 and type in ('loan_collection','loan_repayment') and status = 'posted'`, [loanId],
    )).rows[0].n);
    if (n > 0) throw new DomainError("HAS_PAYMENTS", "El préstamo tiene pagos registrados; anúlalos antes de anular el desembolso inicial.");
    const reversalId = await voidLoanTxn(q, userId, o, loanId, "loan.origin_void", note);
    await q(`update loans set funded_from_account = false where id = $1 and user_id = $2`, [loanId, userId]);
    return { reversalId };
  });
}

// ---- reads --------------------------------------------------------------------

const TODAY = `(now() at time zone 'America/Santo_Domingo')::date`;

const LOAN_SELECT = `
  select l.id, l.direction::text as direction, l.counterparty, l.currency::text as currency,
         l.principal_minor::text as principal, b.principal_paid_minor::text as principal_paid,
         b.interest_paid_minor::text as interest_paid, b.outstanding_minor::text as outstanding, b.status,
         l.start_date::text as start_date, l.due_date::text as due_date, l.interest_rate_pct::text as rate,
         l.account_id, a.name as account_name, l.funded_from_account as funded, l.notes, l.created_at::text as created_at
  from loans l
  join loan_balances b on b.loan_id = l.id
  left join accounts a on a.id = l.account_id`;

const mapLoan = (r: Row): LoanRow => ({
  id: r.id as string, direction: r.direction as LoanDirection, counterparty: r.counterparty as string, currency: r.currency as Currency,
  principalMinor: BigInt(r.principal as string), principalPaidMinor: BigInt(r.principal_paid as string),
  interestPaidMinor: BigInt(r.interest_paid as string), outstandingMinor: BigInt(r.outstanding as string),
  status: r.status as LoanStatus, startDate: r.start_date as string, dueDate: (r.due_date as string | null) ?? null,
  interestRatePct: (r.rate as string | null) ?? null, accountId: (r.account_id as string | null) ?? null,
  accountName: (r.account_name as string | null) ?? null, funded: r.funded as boolean,
  notes: (r.notes as string | null) ?? null, createdAt: r.created_at as string,
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");
const ORDER = `order by (b.status = 'liquidado'), l.due_date nulls last, l.created_at desc, l.id`;

export async function listLoans(ex: Executor, userId: string, raw: LoanFilters = {}): Promise<LoanRow[]> {
  const f = loanFiltersSchema.parse(raw);
  const params: unknown[] = [userId];
  const where = ["l.user_id = $1"];
  const p = (v: unknown) => (params.push(v), `$${params.length}`);
  if (f.direction) where.push(`l.direction::text = ${p(f.direction)}`);
  if (f.status) where.push(`b.status = ${p(f.status)}`);
  if (f.currency) where.push(`l.currency::text = ${p(f.currency)}`);
  if (f.q) where.push(`l.counterparty ilike ${p(`%${escapeLike(f.q)}%`)} escape '\\'`);
  return (await ex.query(`${LOAN_SELECT} where ${where.join(" and ")} ${ORDER}`, params)).rows.map(mapLoan);
}

/** Unpaid loans that are overdue or fall due within `days` days (Santo Domingo calendar), earliest first. */
export async function listDueLoans(ex: Executor, userId: string, days = 30): Promise<LoanRow[]> {
  const n = Math.min(Math.max(Math.trunc(days), 0), 3650);
  const r = await ex.query(
    `${LOAN_SELECT} where l.user_id = $1 and b.outstanding_minor > 0 and l.due_date is not null and l.due_date <= ${TODAY} + $2::int
     order by l.due_date, l.id`,
    [userId, n],
  );
  return r.rows.map(mapLoan);
}

export interface LoanMovement {
  id: string; loanId: string; type: string; date: string; description: string; notes: string | null;
  status: "posted" | "reversed"; reversesId: string | null; accountName: string | null;
  /** Signed from the account's point of view (+ in, - out); reversals carry the opposite sign. */
  principalMinor: bigint; interestMinor: bigint; createdAt: string;
}

async function movementsOf(q: Query, userId: string, loanIds: string[]): Promise<LoanMovement[]> {
  if (!loanIds.length) return [];
  const sum = (kind: string) => `(select coalesce(sum(e.amount_minor), 0)::text from entries e where e.transaction_id = t.id and e.kind = '${kind}')`;
  const r = await q(
    `select t.id, t.loan_id, t.type::text as type, t.date::text as date, t.description, t.notes, t.status::text as status,
            t.reverses_id, t.created_at::text as created_at, ${sum("loan_principal")} as principal, ${sum("loan_interest")} as interest,
            (select a.name from entries e join accounts a on a.id = e.account_id where e.transaction_id = t.id limit 1) as account_name
     from transactions t where t.user_id = $1 and t.loan_id = any($2::uuid[])
     order by t.date, t.created_at, t.id`,
    [userId, loanIds],
  );
  return r.rows.map((x) => ({
    id: x.id as string, loanId: x.loan_id as string, type: x.type as string, date: x.date as string, description: x.description as string,
    notes: (x.notes as string | null) ?? null, status: x.status as "posted" | "reversed", reversesId: (x.reverses_id as string | null) ?? null,
    accountName: (x.account_name as string | null) ?? null, principalMinor: BigInt(x.principal as string),
    interestMinor: BigInt(x.interest as string), createdAt: x.created_at as string,
  }));
}

export interface LoanDetail { loan: LoanRow; movements: LoanMovement[]; history: AuditEntry[] }

export async function getLoan(ex: Executor, userId: string, id: string): Promise<LoanDetail> {
  if (!idSchema.safeParse(id).success) throw notFound("Préstamo");
  const r = await ex.query(`${LOAN_SELECT} where l.user_id = $1 and l.id = $2`, [userId, id]);
  if (!r.rows[0]) throw notFound("Préstamo");
  const [movements, h] = await Promise.all([
    movementsOf(ex.query, userId, [id]),
    ex.query(
      `select id::text as id, action, before, after, created_at::text as "createdAt" from audit_log
       where user_id = $1 and entity_type = 'loan' and entity_id = $2 order by id`,
      [userId, id],
    ),
  ]);
  return { loan: mapLoan(r.rows[0]), movements, history: h.rows as unknown as AuditEntry[] };
}

/** Everything with one person (case-insensitive exact name): their loans and the movements of all of them, oldest first. */
export async function counterpartyHistory(ex: Executor, userId: string, name: string) {
  const r = await ex.query(
    `${LOAN_SELECT} where l.user_id = $1 and lower(btrim(l.counterparty)) = lower(btrim($2)) ${ORDER}`,
    [userId, name],
  );
  const loans = r.rows.map(mapLoan);
  return { loans, movements: await movementsOf(ex.query, userId, loans.map((l) => l.id)) };
}

export interface LoanSummary {
  /** Outstanding principal, per currency. */
  receivable: TotalsByCurrency; payable: TotalsByCurrency;
  /** Net-of-voids interest actually collected (receivables) / paid (payables), per currency. */
  interestCollected: TotalsByCurrency; interestPaid: TotalsByCurrency;
}

/** Totals are per currency; DOP and USD are never added together. */
export async function loanSummary(ex: Executor, userId: string): Promise<LoanSummary> {
  const r = await ex.query(
    `select direction::text as direction, currency::text as currency,
            sum(outstanding_minor)::text as outstanding, sum(interest_paid_minor)::text as interest
     from loan_balances where user_id = $1 group by direction, currency`,
    [userId],
  );
  const s: LoanSummary = { receivable: emptyTotals(), payable: emptyTotals(), interestCollected: emptyTotals(), interestPaid: emptyTotals() };
  for (const x of r.rows) {
    const c = x.currency as Currency;
    const rec = x.direction === "receivable";
    (rec ? s.receivable : s.payable)[c] = BigInt(x.outstanding as string);
    (rec ? s.interestCollected : s.interestPaid)[c] = BigInt(x.interest as string);
  }
  return s;
}
