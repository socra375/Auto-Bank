import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { todayDR } from "../../src/lib/dates";
import { createAccount, getAccount } from "../../src/server/accounts";
import type { Executor } from "../../src/server/executor";
import { netWorth, netWorthEvolution } from "../../src/server/assets";
import { voidMovement } from "../../src/server/ledger";
import {
  cancelLoan, counterpartyHistory, createLoan, getLoan, listDueLoans, listLoans, loanSummary, registerPayment, voidLoanOrigination, voidPayment,
} from "../../src/server/loans";
import { liteExecutor, makeDb } from "../db/helpers";

// NOTE: PGlite is a single connection, so the concurrent-payment race (two registerPayment calls
// interleaving on separate connections) CANNOT be exercised here. The `select ... for update` that
// serialises payments per loan must be verified on real Postgres.

let db: PGlite;
let ex: Executor;
const A = "user_a";
const B = "user_b";
const day = (offset: number) => {
  const d = new Date(`${todayDR()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

beforeEach(async () => {
  db = await makeDb();
  ex = liteExecutor(db);
});

const acct = (u: string, name: string, currency: "DOP" | "USD" = "DOP", opening = "1,000.00") =>
  createAccount(ex, u, { name, type: "bank", currency, openingBalance: opening, openingDate: "2020-01-01" });
const bal = async (u: string, id: string) => (await getAccount(ex.query, u, id)).balanceMinor;
const flow = async (u = A) =>
  (await db.query<{ flow: string; t: string }>(`select flow, sum(amount_minor)::text t from flow_entries where user_id=$1 group by flow order by flow`, [u])).rows
    .map((r) => [r.flow, r.t]);
const count = async (table: string) => Number((await db.query<{ n: number }>(`select count(*)::int n from ${table}`)).rows[0].n);
const status = async (id: string) => (await getLoan(ex, A, id)).loan.status;
const lend = (accountId: string, o: Record<string, unknown> = {}) =>
  createLoan(ex, A, { direction: "receivable", counterparty: "Juan", principal: "1,000.00", currency: "DOP", startDate: "2026-01-10", accountId, funded: true, ...o });
const pay = (loanId: string, accountId: string, o: Record<string, unknown> = {}) =>
  registerPayment(ex, A, loanId, { accountId, date: "2026-02-01", ...o });

describe("creating loans", () => {
  it("funded receivable lowers the balance by the principal and is not income/expense", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a);
    expect(await bal(A, a)).toBe(0n); // 1,000.00 opening - 1,000.00 lent
    expect(await flow()).toEqual([]);
    const l = (await getLoan(ex, A, id)).loan;
    expect([l.status, l.outstandingMinor, l.funded]).toEqual(["pendiente", 100000n, true]);
    expect((await getLoan(ex, A, id)).movements.map((m) => m.type)).toEqual(["loan_disbursement"]);
  });

  it("funded payable raises the balance and is not income", async () => {
    const a = await acct(A, "Banco");
    await lend(a, { direction: "payable", counterparty: "Banco X", principal: "500.00" });
    expect(await bal(A, a)).toBe(150000n);
    expect(await flow()).toEqual([]);
  });

  it("unfunded loan registers pre-existing debt with no money movement", async () => {
    const a = await acct(A, "Banco");
    const { id } = await createLoan(ex, A, { direction: "payable", counterparty: "Mamá", principal: "300", currency: "DOP", startDate: "2026-01-01" });
    expect(await bal(A, a)).toBe(100000n);
    expect(await count("transactions")).toBe(0);
    expect((await getLoan(ex, A, id)).loan.outstandingMinor).toBe(30000n);
  });

  it("rejects invalid input: funded without account, currency mismatch, due before start, other user's account, archived", async () => {
    const dop = await acct(A, "Banco");
    const usd = await acct(A, "USD", "USD");
    const other = await acct(B, "Ajena");
    await expect(lend(dop, { accountId: undefined })).rejects.toThrow(/cuenta/);
    await expect(lend(usd)).rejects.toThrow(/monedas no se mezclan/);
    await expect(lend(dop, { dueDate: "2026-01-01" })).rejects.toThrow(/vencimiento/);
    await expect(lend(other)).rejects.toThrow(/no encontrad/);
    await expect(lend(dop, { principal: "0" })).rejects.toThrow();
    expect(await count("loans")).toBe(0);
    expect(await bal(A, dop)).toBe(100000n);
  });
});

describe("payments", () => {
  it("splits principal/interest; only interest reaches flow_entries, with the right direction", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a, { dueDate: day(60) });
    await pay(id, a, { principal: "400.00", interest: "20.00" });
    expect(await bal(A, a)).toBe(0n + 40000n + 2000n);
    expect(await flow()).toEqual([["income", "2000"]]);
    const l = (await getLoan(ex, A, id)).loan;
    expect([l.principalPaidMinor, l.interestPaidMinor, l.outstandingMinor]).toEqual([40000n, 2000n, 60000n]);

    const p = await acct(A, "Otra");
    const { id: debt } = await createLoan(ex, A, { direction: "payable", counterparty: "Banco", principal: "200", currency: "DOP", startDate: "2026-01-01" });
    await pay(debt, p, { principal: "50", interest: "5" });
    expect(await flow()).toEqual([["expense", "500"], ["income", "2000"]]);
    expect(await bal(A, p)).toBe(100000n - 5500n);
  });

  it("interest-only payment leaves principal untouched", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a);
    await pay(id, a, { interest: "15" });
    expect((await getLoan(ex, A, id)).loan.outstandingMinor).toBe(100000n);
    expect(await status(id)).toBe("pendiente");
    await expect(pay(id, a, {})).rejects.toThrow(/capital y\/o/);
  });

  it("status: pendiente -> parcial -> liquidado; unpaid past due -> vencido (also when partially paid)", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a, { dueDate: day(30) });
    expect(await status(id)).toBe("pendiente");
    await pay(id, a, { principal: "400" });
    expect(await status(id)).toBe("parcial");
    await pay(id, a, { principal: "600" });
    expect(await status(id)).toBe("liquidado");

    const late = await lend(a, { startDate: day(-40), dueDate: day(-1) });
    expect(await status(late.id)).toBe("vencido");
    await pay(late.id, a, { principal: "10", date: day(-1) });
    expect(await status(late.id)).toBe("vencido");
    await pay(late.id, a, { principal: "990", date: day(-1) });
    expect(await status(late.id)).toBe("liquidado");
  });

  it("overpayment is rejected with a clear message and nothing partial persists", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a);
    await pay(id, a, { principal: "900" });
    const before = [await count("transactions"), await count("entries"), await count("audit_log")];
    await expect(pay(id, a, { principal: "100.01", interest: "5" })).rejects.toThrow(/excede el saldo pendiente \(RD\$100\.00\)/);
    expect([await count("transactions"), await count("entries"), await count("audit_log")]).toEqual(before);
    expect((await getLoan(ex, A, id)).loan.outstandingMinor).toBe(10000n);
  });

  it("currency mismatch, archived account, other user's account and unknown loan are rejected", async () => {
    const dop = await acct(A, "Banco");
    const usd = await acct(A, "USD", "USD");
    const other = await acct(B, "Ajena");
    const { id } = await lend(dop);
    await expect(pay(id, usd, { principal: "10" })).rejects.toThrow(/monedas no se mezclan/);
    await expect(pay(id, other, { principal: "10" })).rejects.toThrow(/no encontrad/);
    await expect(pay("not-a-uuid", dop, { principal: "10" })).rejects.toThrow(/no encontrad/);
    await expect(pay("00000000-0000-4000-8000-000000000000", dop, { principal: "10" })).rejects.toThrow(/no encontrad/);
    await expect(pay(id, dop, { principal: "10", date: "2026-01-01" })).rejects.toThrow(/anterior/);
    await ex.query(`update accounts set status='archived' where id=$1`, [dop]);
    await expect(pay(id, dop, { principal: "10" })).rejects.toThrow(/archivada/);
  });

  it("idempotency: same key returns the first result for loans and payments", async () => {
    const a = await acct(A, "Banco");
    const l1 = await lend(a, { idempotencyKey: "loan-key-0001" });
    const l2 = await lend(a, { idempotencyKey: "loan-key-0001" });
    expect([l2.id, l2.duplicate, l1.duplicate]).toEqual([l1.id, true, false]);
    expect(await count("loans")).toBe(1);
    const p1 = await pay(l1.id, a, { principal: "100", idempotencyKey: "pay-key-00001" });
    const p2 = await pay(l1.id, a, { principal: "100", idempotencyKey: "pay-key-00001" });
    expect([p2.id, p2.duplicate]).toEqual([p1.id, true]);
    expect((await getLoan(ex, A, l1.id)).loan.principalPaidMinor).toBe(10000n);
    // unfunded loans dedupe too (they post no transaction)
    const u = { direction: "payable", counterparty: "X", principal: "5", currency: "DOP", startDate: "2026-01-01", idempotencyKey: "loan-key-0002" } as const;
    const u1 = await createLoan(ex, A, u);
    expect((await createLoan(ex, A, u)).id).toBe(u1.id);
  });
});

describe("voiding", () => {
  it("void payment restores outstanding, nets entries to zero, status goes back; double void rejected", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a);
    const p = await pay(id, a, { principal: "1000", interest: "30" });
    expect(await status(id)).toBe("liquidado");
    expect(await flow()).toEqual([["income", "3000"]]);
    await voidPayment(ex, A, p.id, "error de captura");
    const l = (await getLoan(ex, A, id)).loan;
    expect([l.outstandingMinor, l.interestPaidMinor, l.status]).toEqual([100000n, 0n, "pendiente"]);
    expect(await flow()).toEqual([["income", "0"]]);
    expect(await bal(A, a)).toBe(0n);
    await expect(voidPayment(ex, A, p.id)).rejects.toThrow(/ya fue anulado/);
    const reversalId = (await getLoan(ex, A, id)).movements.find((m) => m.type === "reversal")!.id;
    await expect(voidPayment(ex, A, reversalId)).rejects.toThrow(/reversa/);
    // can pay again after voiding
    await pay(id, a, { principal: "1000" });
    expect(await status(id)).toBe("liquidado");
  });

  it("payable payment void; generic voidMovement still refuses loan movements", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a, { direction: "payable" });
    const p = await pay(id, a, { principal: "200", interest: "10" });
    await expect(voidMovement(ex, A, p.id)).rejects.toThrow(/módulo de préstamos/);
    await voidPayment(ex, A, p.id);
    expect(await bal(A, a)).toBe(200000n);
    expect(await flow()).toEqual([["expense", "0"]]);
  });

  it("initial disbursement can be voided only without active payments", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a);
    const origin = (await getLoan(ex, A, id)).movements[0].id;
    const p = await pay(id, a, { principal: "100" });
    await expect(voidLoanOrigination(ex, A, origin)).rejects.toThrow(/pagos registrados/);
    await expect(voidPayment(ex, A, origin)).rejects.toThrow(/no es un pago/);
    await voidPayment(ex, A, p.id);
    await voidLoanOrigination(ex, A, origin);
    expect(await bal(A, a)).toBe(100000n);
    const d = await getLoan(ex, A, id);
    expect([d.loan.funded, d.loan.status]).toEqual([true, "cancelado"]);
  });

  it("another user cannot void my payment", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a);
    const p = await pay(id, a, { principal: "100" });
    await expect(voidPayment(ex, B, p.id)).rejects.toThrow(/no encontrad/);
  });
});

describe("reads", () => {
  it("filters by direction, status, currency and counterparty; isolates users", async () => {
    const dop = await acct(A, "Banco");
    const usd = await acct(A, "USD", "USD");
    const l1 = await lend(dop, { counterparty: "Juan Pérez" });
    await lend(usd, { counterparty: "María", currency: "USD", principal: "50" });
    await lend(dop, { direction: "payable", counterparty: "Banco", principal: "10" });
    await pay(l1.id, dop, { principal: "100" });
    const names = async (f: object) => (await listLoans(ex, A, f)).map((l) => l.counterparty).sort();
    expect(await names({})).toEqual(["Banco", "Juan Pérez", "María"]);
    expect(await names({ direction: "payable" })).toEqual(["Banco"]);
    expect(await names({ currency: "USD" })).toEqual(["María"]);
    expect(await names({ status: "parcial" })).toEqual(["Juan Pérez"]);
    expect(await names({ q: "juan" })).toEqual(["Juan Pérez"]);
    expect(await names({ q: "%" })).toEqual([]);
    expect(await listLoans(ex, B)).toEqual([]);
    await expect(getLoan(ex, B, l1.id)).rejects.toThrow(/no encontrad/);
    expect((await loanSummary(ex, B)).receivable).toEqual({ DOP: 0n, USD: 0n });
  });

  it("summaries are per currency and never mix DOP with USD", async () => {
    const dop = await acct(A, "Banco");
    const usd = await acct(A, "USD", "USD");
    const r1 = await lend(dop, { principal: "1000" });
    await lend(usd, { counterparty: "María", currency: "USD", principal: "50" });
    await lend(dop, { direction: "payable", counterparty: "Banco", principal: "300" });
    const d = await lend(usd, { direction: "payable", counterparty: "Tío", currency: "USD", principal: "20" });
    await pay(r1.id, dop, { principal: "100", interest: "7" });
    await pay(d.id, usd, { principal: "5", interest: "1" });
    const s = await loanSummary(ex, A);
    expect(s.receivable).toEqual({ DOP: 90000n, USD: 5000n });
    expect(s.payable).toEqual({ DOP: 30000n, USD: 1500n });
    expect(s.interestCollected).toEqual({ DOP: 700n, USD: 0n });
    expect(s.interestPaid).toEqual({ DOP: 0n, USD: 100n });
  });

  it("due list: overdue and due-soon unpaid loans, earliest first; settled and far-future excluded", async () => {
    const a = await acct(A, "Banco");
    await lend(a, { counterparty: "Atrasado", startDate: day(-30), dueDate: day(-2), principal: "10" });
    await lend(a, { counterparty: "Pronto", dueDate: day(5), principal: "10" });
    await lend(a, { counterparty: "Lejos", dueDate: day(200), principal: "10" });
    await lend(a, { counterparty: "SinFecha", principal: "10" });
    const paid = await lend(a, { counterparty: "Pagado", startDate: day(-30), dueDate: day(-1), principal: "10" });
    await pay(paid.id, a, { principal: "10", date: day(-1) });
    expect((await listDueLoans(ex, A, 30)).map((l) => [l.counterparty, l.status])).toEqual([["Atrasado", "vencido"], ["Pronto", "pendiente"]]);
  });

  it("history by person groups their loans and payments; detail traces to transactions and audit", async () => {
    const a = await acct(A, "Banco");
    const l1 = await lend(a, { counterparty: "Juan" });
    await lend(a, { counterparty: " juan ", principal: "10" });
    await lend(a, { counterparty: "Otro", principal: "10" });
    const p = await pay(l1.id, a, { principal: "100", interest: "4", notes: "efectivo" });
    const h = await counterpartyHistory(ex, A, "JUAN");
    expect(h.loans).toHaveLength(2);
    expect(h.movements.map((m) => m.type).sort()).toEqual(["loan_collection", "loan_disbursement", "loan_disbursement"]);
    const d = await getLoan(ex, A, l1.id);
    const m = d.movements.find((x) => x.id === p.id)!;
    expect([m.principalMinor, m.interestMinor, m.accountName, m.notes]).toEqual([10000n, 400n, "Banco", "efectivo"]);
    expect(d.history.map((x) => x.action)).toEqual(["loan.create", "loan.payment"]);
  });
});

describe("audit", () => {
  it("every write leaves audit rows in the same transaction (and none on failure)", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a);
    const actions = async () => (await db.query<{ action: string }>(`select action from audit_log where entity_type in ('loan','transaction') order by id`)).rows.map((r) => r.action);
    expect(await actions()).toEqual(["txn.create", "loan.create"]);
    const p = await pay(id, a, { principal: "100" });
    await voidPayment(ex, A, p.id, "x");
    expect((await actions()).slice(2)).toEqual(["txn.create", "loan.payment", "txn.reverse", "txn.void", "loan.payment_void"]);
    const n = await count("audit_log");
    await expect(pay(id, a, { principal: "99999" })).rejects.toThrow();
    expect(await count("audit_log")).toBe(n);
    const d = await getLoan(ex, A, id);
    expect(d.history.map((x) => x.action)).toEqual(["loan.create", "loan.payment", "loan.payment_void"]);
  });
});

describe("cancelled loans", () => {
  const nwDop = async (asOf?: string) => (await netWorth(ex, A, { asOf })).byCurrency.DOP;

  it.each(["receivable", "payable"] as const)("voiding a funded %s origination restores the account and removes the loan from every total", async (direction) => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a, { direction, startDate: "2026-01-10", dueDate: day(-1) });
    const origin = (await getLoan(ex, A, id)).movements[0].id;
    await voidLoanOrigination(ex, A, origin);
    expect(await bal(A, a)).toBe(100000n);
    const s = await loanSummary(ex, A);
    expect([s.receivable.DOP, s.payable.DOP]).toEqual([0n, 0n]);
    expect(await listDueLoans(ex, A)).toEqual([]);
    expect(await listLoans(ex, A)).toEqual([]);
    expect((await listLoans(ex, A, { includeCancelled: true })).map((l) => l.status)).toEqual(["cancelado"]);
    const nw = await nwDop();
    expect([nw.accounts, nw.receivables, nw.payables, nw.net]).toEqual([100000n, 0n, 0n, 100000n]);
    expect((await netWorthEvolution(ex, A, 3)).at(-1)!.byCurrency.DOP.net).toBe(100000n);
    const d = await getLoan(ex, A, id);
    expect([d.loan.status, d.loan.cancelledAt !== null]).toEqual(["cancelado", true]);
    expect(d.history.map((h) => h.action)).toContain("loan.origin_void");
    await expect(voidLoanOrigination(ex, A, origin)).rejects.toThrow(/anulado|cancelado/);
  });

  it("cancelLoan on an unfunded loan: excluded from totals, audited, idempotent-safe, user-isolated", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a, { funded: false, dueDate: day(-1) });
    expect((await nwDop()).receivables).toBe(100000n);
    await expect(cancelLoan(ex, B, id)).rejects.toThrow(/no encontrad/);
    await cancelLoan(ex, A, id, "error de captura");
    await expect(cancelLoan(ex, A, id)).rejects.toThrow(/ya está cancelado/);
    expect(await status(id)).toBe("cancelado");
    expect((await loanSummary(ex, A)).receivable.DOP).toBe(0n);
    expect(await listDueLoans(ex, A)).toEqual([]);
    const nw = await nwDop();
    expect([nw.receivables, nw.net]).toEqual([0n, 100000n]);
    expect(await bal(A, a)).toBe(100000n);
    const h = (await getLoan(ex, A, id)).history.filter((x) => x.action === "loan.cancel");
    expect(h).toHaveLength(1);
    expect((h[0].after as { reason: string }).reason).toBe("error de captura");
  });

  it("as-of net worth: a cancelled loan never counts, at any date (no historical double count)", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a, { funded: false, startDate: "2026-01-10" });
    await cancelLoan(ex, A, id);
    expect((await nwDop("2026-03-01")).receivables).toBe(0n);
    expect((await nwDop(todayDR())).receivables).toBe(0n);
    // funded origination voided later: money restored from the loan's start date AND loan excluded => no window with double count
    const f = await lend(a, { counterparty: "Luis", startDate: "2026-01-20" });
    await voidLoanOrigination(ex, A, (await getLoan(ex, A, f.id)).movements[0].id);
    const mid = await nwDop("2026-02-15");
    expect(mid.receivables).toBe(0n);
    expect(mid.net).toBe(mid.accounts);
  });

  it("cancelLoan is refused with funded loans and with active payments; allowed after voiding them", async () => {
    const a = await acct(A, "Banco");
    const funded = await lend(a);
    await expect(cancelLoan(ex, A, funded.id)).rejects.toThrow(/anula el desembolso/);
    const { id } = await lend(a, { funded: false, counterparty: "Ana" });
    const p = await pay(id, a, { principal: "100" });
    await expect(cancelLoan(ex, A, id)).rejects.toThrow(/pagos registrados/);
    await voidPayment(ex, A, p.id);
    await cancelLoan(ex, A, id);
    expect(await status(id)).toBe("cancelado");
  });

  it("payments on a cancelled loan are rejected by the service and by the DB trigger; reversals still allowed", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a, { funded: false });
    await cancelLoan(ex, A, id);
    await expect(pay(id, a, { principal: "100" })).rejects.toThrow(/cancelado/);
    await expect(db.query(
      `insert into transactions (user_id, type, date, description, loan_id) values ($1,'loan_collection','2026-02-01','x',$2)`, [A, id],
    )).rejects.toThrow(/cancelled/);
    expect(await bal(A, a)).toBe(100000n);
  });

  it("view exposes status 'cancelado' and cancelled_at; other users' loans are unaffected", async () => {
    const a = await acct(A, "Banco");
    const b = await acct(B, "Banco B");
    const mine = await lend(a, { funded: false });
    const theirs = await createLoan(ex, B, { direction: "receivable", counterparty: "Z", principal: "500", currency: "DOP", startDate: "2026-01-10", accountId: b, funded: false });
    await cancelLoan(ex, A, mine.id);
    const rows = (await db.query<{ loan_id: string; status: string; c: boolean }>(`select loan_id, status, cancelled_at is not null c from loan_balances`)).rows;
    expect(rows.find((r) => r.loan_id === mine.id)).toMatchObject({ status: "cancelado", c: true });
    expect(rows.find((r) => r.loan_id === theirs.id)).toMatchObject({ status: "pendiente", c: false });
    expect((await loanSummary(ex, B)).receivable.DOP).toBe(50000n);
    await expect(cancelLoan(ex, B, mine.id)).rejects.toThrow(/no encontrad/);
  });
});
