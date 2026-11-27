import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { makeAccount, makeCategory, makeDb, post, rejects, uid } from "./helpers";

let db: PGlite;
beforeAll(async () => { db = await makeDb(); });

const balance = async (acc: string) =>
  Number((await db.query<{ balance_minor: string }>(`select balance_minor from account_balances where account_id=$1`, [acc])).rows[0].balance_minor);

describe("entries", () => {
  it("are immutable (UPDATE and DELETE raise)", async () => {
    const u = uid(), a = await makeAccount(db, u), c = await makeCategory(db, u, "income");
    await post(db, u, { type: "income", category: c, legs: [{ account: a, kind: "income", amount: 1000 }] });
    await rejects(db.query(`update entries set amount_minor = 5 where user_id=$1`, [u]), /append-only/);
    await rejects(db.query(`delete from entries where user_id=$1`, [u]), /append-only/);
  });

  it("reject currency different from the account currency", async () => {
    const u = uid(), a = await makeAccount(db, u, { currency: "DOP" }), c = await makeCategory(db, u, "income");
    await rejects(
      post(db, u, { type: "income", category: c, legs: [{ account: a, currency: "USD", kind: "income", amount: 1000 }] }),
      /foreign key/i,
    );
  });

  it("reject another user's account", async () => {
    const u1 = uid(), u2 = uid(), a2 = await makeAccount(db, u2), c = await makeCategory(db, u1, "income");
    await rejects(post(db, u1, { type: "income", category: c, legs: [{ account: a2, currency: "DOP", kind: "income", amount: 1 }] }), /foreign key/i);
  });

  it("reject zero amounts and header without legs", async () => {
    const u = uid(), a = await makeAccount(db, u), c = await makeCategory(db, u, "income");
    await rejects(post(db, u, { type: "income", category: c, legs: [{ account: a, kind: "income", amount: 0 }] }), /check constraint/i);
    await rejects(post(db, u, { type: "income", category: c, legs: [] }), /no entries/);
  });

  it("reject malformed leg shapes per type", async () => {
    const u = uid(), a = await makeAccount(db, u), b = await makeAccount(db, u);
    const ce = await makeCategory(db, u, "expense"), ci = await makeCategory(db, u, "income");
    await rejects(post(db, u, { type: "expense", category: ce, legs: [{ account: a, kind: "expense", amount: 100 }] }), /expense needs/);
    await rejects(post(db, u, { type: "income", category: ci, legs: [{ account: a, kind: "income", amount: -100 }] }), /income needs/);
    await rejects(post(db, u, { type: "income", category: ce, legs: [{ account: a, kind: "income", amount: 100 }] }), /category kind/);
    await rejects(post(db, u, { type: "expense", category: ce, legs: [{ account: a, kind: "transfer", amount: -100 }] }), /expense needs/);
    await rejects(
      post(db, u, { type: "income", category: ci, legs: [{ account: a, kind: "income", amount: 100 }, { account: b, kind: "income", amount: 100 }] }),
      /income needs/,
    );
  });

  it("require entry date = transaction date", async () => {
    const u = uid(), a = await makeAccount(db, u), c = await makeCategory(db, u, "income");
    await rejects(post(db, u, { type: "income", category: c, date: "2026-02-01", legDate: "2026-02-02", legs: [{ account: a, kind: "income", amount: 5 }] }), /entry date/);
  });
});

describe("transfers", () => {
  it("must be exactly 2 legs, zero-sum, on different accounts", async () => {
    const u = uid(), a = await makeAccount(db, u), b = await makeAccount(db, u);
    await rejects(post(db, u, { type: "transfer", legs: [{ account: a, kind: "transfer", amount: -100 }] }), /transfer needs/);
    await rejects(
      post(db, u, { type: "transfer", legs: [{ account: a, kind: "transfer", amount: -100 }, { account: b, kind: "transfer", amount: 90 }] }),
      /sum to zero/,
    );
    await rejects(
      post(db, u, { type: "transfer", legs: [{ account: a, kind: "transfer", amount: -100 }, { account: a, kind: "transfer", amount: 100 }] }),
      /different accounts/,
    );
    await rejects(
      post(db, u, { type: "transfer", legs: [{ account: a, kind: "transfer", amount: -100 }, { account: b, kind: "transfer", amount: 50 }, { account: b, kind: "transfer", amount: 50 }] }),
      /transfer needs/,
    );
    await post(db, u, { type: "transfer", legs: [{ account: a, kind: "transfer", amount: -100 }, { account: b, kind: "transfer", amount: 100 }] });
  });

  it("cross-currency transfer: each leg in its account currency, no zero-sum across currencies", async () => {
    const u = uid(), dop = await makeAccount(db, u, { currency: "DOP" }), usd = await makeAccount(db, u, { currency: "USD" });
    await post(db, u, { type: "transfer", legs: [{ account: dop, kind: "transfer", amount: -6000_00 }, { account: usd, kind: "transfer", amount: 100_00 }] });
    expect(await balance(dop)).toBe(-6000_00);
    expect(await balance(usd)).toBe(100_00);
  });

  it("are not counted as income/expense (flow_entries)", async () => {
    const u = uid(), a = await makeAccount(db, u), b = await makeAccount(db, u);
    const ci = await makeCategory(db, u, "income"), ce = await makeCategory(db, u, "expense");
    await post(db, u, { type: "transfer", legs: [{ account: a, kind: "transfer", amount: -700 }, { account: b, kind: "transfer", amount: 700 }] });
    await post(db, u, { type: "income", category: ci, legs: [{ account: a, kind: "income", amount: 1000 }] });
    await post(db, u, { type: "expense", category: ce, legs: [{ account: b, kind: "expense", amount: -200 }] });
    await post(db, u, { type: "adjustment", legs: [{ account: a, kind: "adjustment", amount: 50 }] });
    const r = await db.query<{ flow: string; currency: string; total: string }>(
      `select flow, currency, sum(amount_minor) total from flow_entries where user_id=$1 group by flow, currency order by flow`, [u]);
    expect(r.rows.map((x) => [x.flow, x.currency, Number(x.total)])).toEqual([["expense", "DOP", 200], ["income", "DOP", 1000]]);
  });
});

describe("balances", () => {
  it("= opening + sum(entries), per account and per currency, never mixed", async () => {
    const u = uid();
    const dop1 = await makeAccount(db, u, { opening: 10_000 }), dop2 = await makeAccount(db, u, { opening: 500 });
    const usd = await makeAccount(db, u, { currency: "USD", opening: 7_000 });
    const ci = await makeCategory(db, u, "income"), ce = await makeCategory(db, u, "expense");
    await post(db, u, { type: "income", category: ci, legs: [{ account: dop1, kind: "income", amount: 2_500 }] });
    await post(db, u, { type: "expense", category: ce, legs: [{ account: dop1, kind: "expense", amount: -1_000 }] });
    await post(db, u, { type: "transfer", legs: [{ account: dop1, kind: "transfer", amount: -3_000 }, { account: dop2, kind: "transfer", amount: 3_000 }] });
    await post(db, u, { type: "income", category: ci, legs: [{ account: usd, kind: "income", amount: 99 }] });
    expect(await balance(dop1)).toBe(10_000 + 2_500 - 1_000 - 3_000);
    expect(await balance(dop2)).toBe(3_500);
    expect(await balance(usd)).toBe(7_099);
    const r = await db.query<{ currency: string; total: string }>(
      `select currency, sum(balance_minor) total from account_balances where user_id=$1 group by currency order by currency`, [u]);
    expect(r.rows.map((x) => [x.currency, Number(x.total)])).toEqual([["DOP", 10_000 + 500 + 2_500 - 1_000], ["USD", 7_099]]);
  });

  it("archived account keeps history and balance, rejects new postings", async () => {
    const u = uid(), a = await makeAccount(db, u, { opening: 100 }), c = await makeCategory(db, u, "income");
    await post(db, u, { type: "income", category: c, legs: [{ account: a, kind: "income", amount: 400 }] });
    await db.query(`update accounts set status='archived' where id=$1`, [a]);
    expect(await balance(a)).toBe(500);
    expect((await db.query(`select 1 from entries where account_id=$1`, [a])).rows).toHaveLength(1);
    await rejects(post(db, u, { type: "income", category: c, legs: [{ account: a, kind: "income", amount: 1 }] }), /archived/);
    await rejects(db.query(`delete from accounts where id=$1`, [a]), /append-only/);
  });

  it("account currency cannot change; financial header fields are frozen", async () => {
    const u = uid(), a = await makeAccount(db, u), c = await makeCategory(db, u, "income");
    await rejects(db.query(`update accounts set currency='USD' where id=$1`, [a]), /currency/);
    const t = await post(db, u, { type: "income", category: c, legs: [{ account: a, kind: "income", amount: 10 }] });
    await rejects(db.query(`update transactions set date='2026-03-01' where id=$1`, [t]), /immutable/);
    await db.query(`update transactions set description='edited', notes='n' where id=$1`, [t]); // meta edit is fine
    await rejects(db.query(`delete from transactions where id=$1`, [t]), /append-only/);
  });
});

describe("idempotency and reversals", () => {
  it("duplicate idempotency key per user is rejected; other users unaffected", async () => {
    const u = uid(), u2 = uid(), a = await makeAccount(db, u), a2 = await makeAccount(db, u2);
    const c = await makeCategory(db, u, "income"), c2 = await makeCategory(db, u2, "income");
    await post(db, u, { type: "income", category: c, key: "k1", legs: [{ account: a, kind: "income", amount: 1 }] });
    await rejects(post(db, u, { type: "income", category: c, key: "k1", legs: [{ account: a, kind: "income", amount: 1 }] }), /unique|duplicate/i);
    await post(db, u2, { type: "income", category: c2, key: "k1", legs: [{ account: a2, kind: "income", amount: 1 }] });
    expect(await balance(a)).toBe(1);
  });

  it("reversal nets to zero, cannot be partial, cannot be repeated", async () => {
    const u = uid(), a = await makeAccount(db, u, { opening: 50 }), c = await makeCategory(db, u, "income");
    const t = await post(db, u, { type: "income", category: c, legs: [{ account: a, kind: "income", amount: 300 }] });
    await rejects(post(db, u, { type: "reversal", reverses: t, category: c, legs: [{ account: a, kind: "income", amount: -299 }] }), /exact negation/);
    await post(db, u, { type: "reversal", reverses: t, category: c, date: "2026-03-01", legDate: "2026-02-01", legs: [{ account: a, kind: "income", amount: -300 }] });
    expect(await balance(a)).toBe(50);
    const net = await db.query<{ s: string }>(`select sum(amount_minor) s from flow_entries where user_id=$1`, [u]);
    expect(Number(net.rows[0].s)).toBe(0);
    await rejects(post(db, u, { type: "reversal", reverses: t, category: c, date: "2026-03-01", legDate: "2026-02-01", legs: [{ account: a, kind: "income", amount: -300 }] }), /unique|duplicate/i);
  });
});
