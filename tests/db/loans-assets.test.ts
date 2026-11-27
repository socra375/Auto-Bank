import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeAccount, makeCategory, makeDb, makeLoan, post, rejects, uid } from "./helpers";

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });

const loanRow = async (id: string) =>
  (await db.query<{ status: string; outstanding_minor: string; principal_paid_minor: string; interest_paid_minor: string }>(
    `select * from loan_balances where loan_id=$1`, [id])).rows[0];
const flows = async (u: string) =>
  (await db.query<{ flow: string; total: string }>(`select flow, sum(amount_minor) total from flow_entries where user_id=$1 group by flow order by flow`, [u])).rows
    .map((r) => [r.flow, Number(r.total)]);

describe("loans", () => {
  it("separates principal and interest; status pendiente -> parcial -> liquidado; not income/expense except interest", async () => {
    const u = uid(), a = await makeAccount(db, u, { opening: 1_000_000 });
    const loan = await makeLoan(db, u, { direction: "receivable", principal: 100_000, due: "2999-01-01" });
    await post(db, u, { type: "loan_disbursement", loan, legs: [{ account: a, kind: "loan_principal", amount: -100_000 }] });
    expect((await loanRow(loan)).status).toBe("pendiente");
    expect(await flows(u)).toEqual([]); // disbursement is neither income nor expense

    await post(db, u, { type: "loan_collection", loan, legs: [
      { account: a, kind: "loan_principal", amount: 40_000 }, { account: a, kind: "loan_interest", amount: 2_000 }] });
    const r = await loanRow(loan);
    expect([r.status, Number(r.outstanding_minor), Number(r.principal_paid_minor), Number(r.interest_paid_minor)]).toEqual(["parcial", 60_000, 40_000, 2_000]);
    expect(await flows(u)).toEqual([["income", 2_000]]); // only interest, on a receivable

    await post(db, u, { type: "loan_collection", loan, legs: [{ account: a, kind: "loan_principal", amount: 60_000 }] });
    expect((await loanRow(loan)).status).toBe("liquidado");
  });

  it("payable: proceeds are not income, repayment interest is expense", async () => {
    const u = uid(), a = await makeAccount(db, u);
    const loan = await makeLoan(db, u, { direction: "payable", principal: 50_000 });
    await post(db, u, { type: "loan_proceeds", loan, legs: [{ account: a, kind: "loan_principal", amount: 50_000 }] });
    await post(db, u, { type: "loan_repayment", loan, legs: [
      { account: a, kind: "loan_principal", amount: -10_000 }, { account: a, kind: "loan_interest", amount: -500 }] });
    expect(await flows(u)).toEqual([["expense", 500]]);
    expect(Number((await loanRow(loan)).outstanding_minor)).toBe(40_000);
  });

  it("overdue unpaid = vencido; overpayment, wrong direction and wrong currency rejected", async () => {
    const u = uid(), a = await makeAccount(db, u), usd = await makeAccount(db, u, { currency: "USD" });
    const loan = await makeLoan(db, u, { direction: "receivable", principal: 1_000, due: "2000-01-01" });
    expect((await loanRow(loan)).status).toBe("vencido");
    await rejects(post(db, u, { type: "loan_collection", loan, legs: [{ account: a, kind: "loan_principal", amount: 1_001 }] }), /out of range/);
    await rejects(post(db, u, { type: "loan_repayment", loan, legs: [{ account: a, kind: "loan_principal", amount: -10 }] }), /payable/);
    await rejects(post(db, u, { type: "loan_collection", loan, legs: [{ account: usd, kind: "loan_principal", amount: 10 }] }), /currency/);
    await rejects(post(db, u, { type: "loan_collection", loan, legs: [{ account: a, kind: "income", amount: 10 }] }), /loan_collection/);
  });

  it("voiding a payment (reversal) restores the outstanding amount and interest flow", async () => {
    const u = uid(), a = await makeAccount(db, u);
    const loan = await makeLoan(db, u, { direction: "receivable", principal: 1_000, due: "2999-01-01" });
    const pay = await post(db, u, { type: "loan_collection", loan, legs: [
      { account: a, kind: "loan_principal", amount: 1_000 }, { account: a, kind: "loan_interest", amount: 100 }] });
    expect((await loanRow(loan)).status).toBe("liquidado");
    await post(db, u, { type: "reversal", reverses: pay, loan, date: "2026-03-01", legDate: "2026-02-01", legs: [
      { account: a, kind: "loan_principal", amount: -1_000 }, { account: a, kind: "loan_interest", amount: -100 }] });
    expect((await loanRow(loan)).status).toBe("pendiente");
    expect(await flows(u)).toEqual([["income", 0]]);
  });

  it("cannot use another user's loan", async () => {
    const u1 = uid(), u2 = uid(), a = await makeAccount(db, u1), loan = await makeLoan(db, u2, { direction: "receivable", principal: 10 });
    await rejects(post(db, u1, { type: "loan_collection", loan, legs: [{ account: a, kind: "loan_principal", amount: 5 }] }), /foreign key/i);
  });
});

describe("assets", () => {
  it("valuations are append-only; latest is the current value", async () => {
    const u = uid();
    const asset = (await db.query<{ id: string }>(`insert into assets (user_id,name,type,currency) values ($1,'Casa','real_estate','DOP') returning id`, [u])).rows[0].id;
    const add = (v: number, d: string) => db.query(`insert into asset_valuations (asset_id,user_id,value_minor,valued_on) values ($1,$2,$3,$4)`, [asset, u, v, d]);
    await add(100, "2026-01-01"); await add(150, "2026-06-01"); await add(120, "2026-03-01");
    const cur = await db.query<{ value_minor: string }>(`select value_minor from asset_current_values where asset_id=$1`, [asset]);
    expect(Number(cur.rows[0].value_minor)).toBe(150);
    await rejects(db.query(`update asset_valuations set value_minor=1 where asset_id=$1`, [asset]), /append-only/);
    await rejects(db.query(`delete from asset_valuations where asset_id=$1`, [asset]), /append-only/);
    await rejects(db.query(`insert into asset_valuations (asset_id,user_id,value_minor,valued_on) values ($1,'other',1,'2026-01-01')`, [asset]), /foreign key/i);
    await rejects(add(-1, "2026-07-01"), /check constraint/i);
  });
});

describe("audit_log, exchange_rates, user isolation", () => {
  it("audit_log is append-only", async () => {
    const u = uid();
    await db.query(`insert into audit_log (user_id, actor, action, entity_type) values ($1,'user','x','y')`, [u]);
    await rejects(db.query(`update audit_log set action='z' where user_id=$1`, [u]), /append-only/);
    await rejects(db.query(`delete from audit_log where user_id=$1`, [u]), /append-only/);
  });

  it("exchange rates: positive, distinct currencies, one per day", async () => {
    const u = uid();
    const ins = (b: string, q: string, r: number) => db.query(`insert into exchange_rates (user_id,base,quote,rate,effective_date) values ($1,$2,$3,$4,'2026-01-01')`, [u, b, q, r]);
    await ins("USD", "DOP", 60.5);
    await rejects(ins("USD", "DOP", 61), /unique|duplicate/i);
    await rejects(ins("USD", "USD", 1), /check constraint/i);
    await rejects(ins("DOP", "USD", 0), /check constraint/i);
  });

  it("category of another user is rejected", async () => {
    const u1 = uid(), u2 = uid(), a = await makeAccount(db, u1), c = await makeCategory(db, u2, "income");
    await rejects(post(db, u1, { type: "income", category: c, legs: [{ account: a, kind: "income", amount: 1 }] }), /foreign key/i);
  });
});
