import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Executor } from "../../src/server/executor";
import { liteExecutor, makeDb } from "../db/helpers";
import {
  archiveAccount, createAccount, getAccount, listAccounts, totalsByCurrency, unarchiveAccount, updateAccount,
} from "../../src/server/accounts";
import { createCategory, listCategories, seedDefaultCategories, setCategoryStatus } from "../../src/server/categories";
import {
  correctMovement, createAdjustment, createExpense, createIncome, createMovement, createTransfer, getMovement,
  listMovements, postTransaction, updateMovementMeta, voidMovement,
} from "../../src/server/ledger";
import { consolidate, listRates, saveRate } from "../../src/server/fx";

let db: PGlite;
let ex: Executor;
const A = "user_a";
const B = "user_b";

beforeEach(async () => {
  db = await makeDb();
  ex = liteExecutor(db);
});

const acct = (u: string, name: string, currency: "DOP" | "USD" = "DOP", opening = "1,000.00") =>
  createAccount(ex, u, { name, type: "bank", currency, openingBalance: opening, openingDate: "2026-01-01" });
const cat = (u: string, name: string, kind: "income" | "expense") => createCategory(ex, u, { name, kind });
const bal = async (u: string, id: string) => (await getAccount(ex.query, u, id)).balanceMinor;
const count = async (table: string) => Number((await db.query<{ n: number }>(`select count(*)::int n from ${table}`)).rows[0].n);
const flow = async () =>
  (await db.query<{ flow: string; currency: string; t: string }>(
    `select flow, currency::text currency, sum(amount_minor)::text t from flow_entries group by flow, currency`)).rows;

describe("accounts", () => {
  it("balance = opening + entries, per currency; totals never mix DOP and USD", async () => {
    const dop = await acct(A, "Banco", "DOP", "1,000.00");
    const usd = await acct(A, "Dólares", "USD", "50.00");
    const inc = await cat(A, "Salario", "income");
    const exp = await cat(A, "Comida", "expense");
    await createIncome(ex, A, { accountId: dop, categoryId: inc, amount: "500", date: "2026-02-01", description: "Pago" });
    await createExpense(ex, A, { accountId: dop, categoryId: exp, amount: "120.50", date: "2026-02-02", description: "Super" });
    await createIncome(ex, A, { accountId: usd, categoryId: inc, amount: "10", date: "2026-02-03", description: "Freelance" });
    expect(await bal(A, dop)).toBe(137950n);
    expect(await bal(A, usd)).toBe(6000n);
    expect(totalsByCurrency(await listAccounts(ex, A))).toEqual({ DOP: 137950n, USD: 6000n });
  });

  it("edit changes only name/description; duplicate name is a friendly error", async () => {
    const id = await acct(A, "Uno");
    await acct(A, "Dos");
    await updateAccount(ex, A, id, { name: "Uno bis", description: "Principal" });
    const a = await getAccount(ex.query, A, id);
    expect([a.name, a.description, a.currency]).toEqual(["Uno bis", "Principal", "DOP"]);
    await expect(updateAccount(ex, A, id, { name: "Dos" })).rejects.toThrow(/Ya existe/);
  });

  it("rejects invalid money/currency at the boundary", async () => {
    await expect(createAccount(ex, A, { name: "x", type: "bank", currency: "EUR" as never, openingDate: "2026-01-01" })).rejects.toThrow();
    await expect(acct(A, "neg", "DOP", "-5")).rejects.toThrow();
    const dop = await acct(A, "ok");
    const inc = await cat(A, "S", "income");
    for (const amount of ["0", "-1", "1.234", "abc", ""]) {
      await expect(createIncome(ex, A, { accountId: dop, categoryId: inc, amount, date: "2026-02-01", description: "x" })).rejects.toThrow();
    }
  });

  it("archived account rejects postings but keeps history and balance; unarchive restores", async () => {
    const id = await acct(A, "Vieja", "DOP", "0");
    const other = await acct(A, "Otra");
    const inc = await cat(A, "S", "income");
    await createIncome(ex, A, { accountId: id, categoryId: inc, amount: "10", date: "2026-02-01", description: "x" });
    await expect(archiveAccount(ex, A, id)).rejects.toThrow(/saldo/);
    await archiveAccount(ex, A, id, { confirmNonZero: true });
    expect(await bal(A, id)).toBe(1000n);
    await expect(createIncome(ex, A, { accountId: id, categoryId: inc, amount: "1", date: "2026-02-02", description: "y" })).rejects.toThrow(/archivada/);
    await expect(createTransfer(ex, A, { fromAccountId: other, toAccountId: id, amount: "1", date: "2026-02-02", description: "t" })).rejects.toThrow(/archivada/);
    // history still visible
    expect((await listMovements(ex, A, { accountId: id })).total).toBe(1);
    await unarchiveAccount(ex, A, id);
    await createIncome(ex, A, { accountId: id, categoryId: inc, amount: "1", date: "2026-02-02", description: "y" });
    expect(await bal(A, id)).toBe(1100n);
  });
});

describe("categories", () => {
  it("seed is explicit and idempotent", async () => {
    expect(await listCategories(ex, A)).toHaveLength(0);
    const n = await seedDefaultCategories(ex, A);
    expect(n).toBeGreaterThan(10);
    expect(await seedDefaultCategories(ex, A)).toBe(0);
    expect((await listCategories(ex, A)).length).toBe(n);
    expect(await listCategories(ex, B)).toHaveLength(0);
  });
  it("archived category cannot be used; kind must match", async () => {
    const acc = await acct(A, "B");
    const inc = await cat(A, "S", "income");
    const exp = await cat(A, "G", "expense");
    await expect(createIncome(ex, A, { accountId: acc, categoryId: exp, amount: "1", date: "2026-02-01", description: "x" })).rejects.toThrow(/no corresponde/);
    await setCategoryStatus(ex, A, inc, "archived");
    await expect(createIncome(ex, A, { accountId: acc, categoryId: inc, amount: "1", date: "2026-02-01", description: "x" })).rejects.toThrow(/archivada/);
  });
});

describe("movements", () => {
  it("transfer is not income/expense in flow_entries; legs net to zero in same currency", async () => {
    const a = await acct(A, "A", "DOP", "100");
    const b = await acct(A, "B", "DOP", "0");
    const { id } = await createTransfer(ex, A, { fromAccountId: a, toAccountId: b, amount: "40", date: "2026-02-01", description: "Mover" });
    expect(await flow()).toEqual([]);
    expect(await bal(A, a)).toBe(6000n);
    expect(await bal(A, b)).toBe(4000n);
    expect((await getMovement(ex, A, id)).legs.map((l) => l.amountMinor).sort()).toEqual([-4000n, 4000n]);
  });

  it("cross-currency transfer needs explicit fx rate and both amounts", async () => {
    const d = await acct(A, "DOP", "DOP", "10,000");
    const u = await acct(A, "USD", "USD", "0");
    const base = { fromAccountId: d, toAccountId: u, amount: "5,900", date: "2026-02-01", description: "Cambio" };
    await expect(createTransfer(ex, A, base)).rejects.toThrow(/tasa/);
    await expect(createTransfer(ex, A, { ...base, fxRate: "59" })).rejects.toThrow(/tasa/);
    await expect(createTransfer(ex, A, { ...base, amountIn: "100" })).rejects.toThrow(/tasa/);
    await createTransfer(ex, A, { ...base, amountIn: "100", fxRate: "59" });
    expect(await bal(A, d)).toBe(410000n);
    expect(await bal(A, u)).toBe(10000n);
    const [m] = (await listMovements(ex, A)).items;
    expect(m.fxRate).toBe("59.000000");
    expect(await flow()).toEqual([]);
  });

  it("same-currency transfer rejects mismatching amountIn and same account", async () => {
    const a = await acct(A, "A");
    const b = await acct(A, "B");
    const t = { fromAccountId: a, toAccountId: b, amount: "10", date: "2026-02-01", description: "t" };
    await expect(createTransfer(ex, A, { ...t, amountIn: "11" })).rejects.toThrow(/igual/);
    await expect(createTransfer(ex, A, { ...t, toAccountId: a })).rejects.toThrow(/distintas/);
  });

  it("adjustment is neither income nor expense", async () => {
    const a = await acct(A, "A", "DOP", "100");
    await createAdjustment(ex, A, { accountId: a, direction: "decrease", amount: "30", date: "2026-02-01", description: "Ajuste" });
    expect(await bal(A, a)).toBe(7000n);
    expect(await flow()).toEqual([]);
  });

  it("edit = reversal + new; net effect correct, chain linked, original marked", async () => {
    const a = await acct(A, "A", "DOP", "0");
    const b = await acct(A, "B", "DOP", "0");
    const exp = await cat(A, "G", "expense");
    const { id } = await createExpense(ex, A, { accountId: a, categoryId: exp, amount: "100", date: "2026-02-01", description: "Cena" });
    const { reversalId, newId } = await correctMovement(ex, A, id, {
      type: "expense", accountId: b, categoryId: exp, amount: "80", date: "2026-02-03", description: "Cena (corregida)",
    });
    expect(await bal(A, a)).toBe(0n);
    expect(await bal(A, b)).toBe(-8000n);
    const orig = await getMovement(ex, A, id);
    expect(orig.status).toBe("reversed");
    expect(orig.replacedById).toBe(newId);
    expect(orig.reversal?.id).toBe(reversalId);
    expect((await getMovement(ex, A, reversalId)).reverses?.id).toBe(id);
    expect(orig.history.map((h) => h.action)).toEqual(["txn.create", "txn.correct"]);
    // period report nets: -100 + 100 - 80
    expect(await flow()).toEqual([{ flow: "expense", currency: "DOP", t: "8000" }]);
    // can also change the type
    const r2 = await correctMovement(ex, A, newId, { type: "adjustment", accountId: b, direction: "increase", amount: "5", date: "2026-02-04", description: "Ajuste" });
    expect(await bal(A, b)).toBe(500n);
    expect((await getMovement(ex, A, r2.newId)).type).toBe("adjustment");
  });

  it("anular nets to zero; double anular and anular of a reversal are rejected; no correction after anular", async () => {
    const a = await acct(A, "A", "DOP", "100");
    const inc = await cat(A, "S", "income");
    const { id } = await createIncome(ex, A, { accountId: a, categoryId: inc, amount: "50", date: "2026-02-01", description: "x" });
    const { reversalId } = await voidMovement(ex, A, id, "error");
    expect(await bal(A, a)).toBe(10000n);
    expect(await flow()).toEqual([{ flow: "income", currency: "DOP", t: "0" }]);
    await expect(voidMovement(ex, A, id)).rejects.toThrow(/ya fue anulado/);
    await expect(voidMovement(ex, A, reversalId)).rejects.toThrow(/reversa/);
    await expect(correctMovement(ex, A, id, { type: "income", accountId: a, categoryId: inc, amount: "1", date: "2026-02-01", description: "x" })).rejects.toThrow(/anulado/);
    expect((await getMovement(ex, A, id)).status).toBe("reversed");
  });

  it("anular still works after the account is archived (reversals are allowed there)", async () => {
    const a = await acct(A, "A", "DOP", "0");
    const inc = await cat(A, "S", "income");
    const { id } = await createIncome(ex, A, { accountId: a, categoryId: inc, amount: "50", date: "2026-02-01", description: "x" });
    await archiveAccount(ex, A, a, { confirmNonZero: true });
    await voidMovement(ex, A, id);
    expect(await bal(A, a)).toBe(0n);
  });

  it("meta edits are in place with before/after audit; category change only same kind", async () => {
    const a = await acct(A, "A");
    const c1 = await cat(A, "S1", "income");
    const c2 = await cat(A, "S2", "income");
    const e1 = await cat(A, "G", "expense");
    const { id } = await createIncome(ex, A, { accountId: a, categoryId: c1, amount: "5", date: "2026-02-01", description: "viejo" });
    await updateMovementMeta(ex, A, id, { description: "nuevo", notes: "n", categoryId: c2 });
    const m = await getMovement(ex, A, id);
    expect([m.description, m.notes, m.categoryId, m.status]).toEqual(["nuevo", "n", c2, "posted"]);
    const upd = m.history.find((h) => h.action === "txn.update")!;
    expect((upd.before as { description: string }).description).toBe("viejo");
    expect((upd.after as { description: string }).description).toBe("nuevo");
    await expect(updateMovementMeta(ex, A, id, { description: "x", categoryId: e1 })).rejects.toThrow(/no corresponde/);
    expect(await count("entries")).toBe(1); // no financial rows touched
  });

  it("idempotency key prevents duplicates (sequential and concurrent)", async () => {
    const a = await acct(A, "A", "DOP", "0");
    const inc = await cat(A, "S", "income");
    const input = { type: "income", accountId: a, categoryId: inc, amount: "10", date: "2026-02-01", description: "x", idempotencyKey: "key-12345678" } as const;
    const r1 = await createMovement(ex, A, input);
    const r2 = await createMovement(ex, A, input);
    expect(r2).toEqual({ id: r1.id, duplicate: true });
    await Promise.all([createMovement(ex, A, { ...input, idempotencyKey: "key-concurrent" }), createMovement(ex, A, { ...input, idempotencyKey: "key-concurrent" })]);
    expect(await bal(A, a)).toBe(2000n);
    expect(await count("transactions")).toBe(2);
  });

  it("failed leg check rolls back the whole transaction: no header, entries or audit rows", async () => {
    const a = await acct(A, "A");
    const auditBefore = await count("audit_log");
    // expense with a POSITIVE leg violates the deferred leg-shape trigger at COMMIT
    await expect(
      ex.transaction((q) =>
        postTransaction(q, A, { type: "expense", date: "2026-02-01", description: "mal", categoryId: undefined,
          legs: [{ accountId: a, currency: "DOP", kind: "expense", amountMinor: 100n }] }),
      ),
    ).rejects.toThrow();
    expect(await count("transactions")).toBe(0);
    expect(await count("entries")).toBe(0);
    expect(await count("audit_log")).toBe(auditBefore);
  });

  it("every write leaves an audit_log row", async () => {
    const a = await acct(A, "A");
    const b = await acct(A, "B");
    const inc = await cat(A, "S", "income");
    const { id } = await createIncome(ex, A, { accountId: a, categoryId: inc, amount: "5", date: "2026-02-01", description: "x" });
    await updateMovementMeta(ex, A, id, { description: "y" });
    await voidMovement(ex, A, id);
    await updateAccount(ex, A, a, { name: "A2" });
    await archiveAccount(ex, A, b, { confirmNonZero: true });
    const actions = (await db.query<{ action: string }>(`select action from audit_log where user_id = $1 order by id`, [A])).rows.map((r) => r.action);
    expect(actions).toEqual([
      "account.create", "account.create", "category.create", "txn.create", "txn.update", "txn.reverse", "txn.void",
      "account.update", "account.archive",
    ]);
  });

  it("list: filters, text search (with LIKE wildcards escaped) and pagination", async () => {
    const d = await acct(A, "DOP", "DOP", "1000");
    const u = await acct(A, "USD", "USD", "1000");
    const inc = await cat(A, "S", "income");
    const exp = await cat(A, "G", "expense");
    await createIncome(ex, A, { accountId: d, categoryId: inc, amount: "1", date: "2026-01-10", description: "Sueldo enero" });
    await createExpense(ex, A, { accountId: d, categoryId: exp, amount: "2", date: "2026-02-10", description: "Super 100%" });
    await createExpense(ex, A, { accountId: u, categoryId: exp, amount: "3", date: "2026-03-10", description: "Amazon" });
    const total = async (f: object) => (await listMovements(ex, A, f)).total;
    expect(await total({})).toBe(3);
    expect(await total({ types: ["expense"] })).toBe(2);
    expect(await total({ currency: "USD" })).toBe(1);
    expect(await total({ accountId: d })).toBe(2);
    expect(await total({ categoryId: inc })).toBe(1);
    expect(await total({ from: "2026-02-01", to: "2026-02-28" })).toBe(1);
    expect(await total({ q: "amazon" })).toBe(1);
    expect(await total({ q: "%" })).toBe(1); // literal percent, not wildcard
    expect(await total({ q: "_" })).toBe(0);
    const p1 = await listMovements(ex, A, { pageSize: 2 });
    const p2 = await listMovements(ex, A, { pageSize: 2, page: 2 });
    expect([p1.items.length, p2.items.length, p1.total]).toEqual([2, 1, 3]);
    expect(p1.items[0].description).toBe("Amazon"); // newest first
  });
});

describe("cross-user isolation", () => {
  it("user B cannot read or alter user A's data through any service", async () => {
    const a = await acct(A, "A", "DOP", "100");
    const a2 = await acct(A, "A2");
    const inc = await cat(A, "S", "income");
    const { id } = await createIncome(ex, A, { accountId: a, categoryId: inc, amount: "5", date: "2026-02-01", description: "x" });
    const bacc = await acct(B, "B");
    const binc = await cat(B, "SB", "income");

    expect(await listAccounts(ex, B)).toHaveLength(1);
    expect((await listMovements(ex, B)).total).toBe(0);
    await expect(getAccount(ex.query, B, a)).rejects.toThrow(/no encontrado/);
    await expect(getMovement(ex, B, id)).rejects.toThrow(/no encontrado/);
    await expect(updateAccount(ex, B, a, { name: "hack" })).rejects.toThrow(/no encontrado/);
    await expect(archiveAccount(ex, B, a, { confirmNonZero: true })).rejects.toThrow(/no encontrado/);
    await expect(unarchiveAccount(ex, B, a)).rejects.toThrow(/no encontrado/);
    await expect(setCategoryStatus(ex, B, inc, "archived")).rejects.toThrow(/no encontrado/);
    await expect(voidMovement(ex, B, id)).rejects.toThrow(/no encontrado/);
    await expect(updateMovementMeta(ex, B, id, { description: "hack" })).rejects.toThrow(/no encontrado/);
    await expect(correctMovement(ex, B, id, { type: "income", accountId: bacc, categoryId: binc, amount: "1", date: "2026-02-01", description: "x" })).rejects.toThrow(/no encontrado/);
    // posting into A's account / category / transfer leg from B
    await expect(createIncome(ex, B, { accountId: a, categoryId: binc, amount: "1", date: "2026-02-01", description: "x" })).rejects.toThrow(/no encontrado/);
    await expect(createIncome(ex, B, { accountId: bacc, categoryId: inc, amount: "1", date: "2026-02-01", description: "x" })).rejects.toThrow(/no encontrado/);
    await expect(createTransfer(ex, B, { fromAccountId: bacc, toAccountId: a2, amount: "1", date: "2026-02-01", description: "x" })).rejects.toThrow(/no encontrado/);

    // A's data is untouched; same idempotency key is independent per user
    expect(await bal(A, a)).toBe(10500n);
    expect((await getMovement(ex, A, id)).description).toBe("x");
    const k = { type: "income", amount: "1", date: "2026-02-01", description: "x", idempotencyKey: "shared-key-1" } as const;
    const r1 = await createMovement(ex, A, { ...k, accountId: a, categoryId: inc });
    const r2 = await createMovement(ex, B, { ...k, accountId: bacc, categoryId: binc });
    expect(r1.id).not.toBe(r2.id);
    expect(r2.duplicate).toBe(false);
  });

  it("exchange rates are per user", async () => {
    await saveRate(ex, A, { base: "USD", quote: "DOP", rate: "59", date: "2026-02-01" });
    expect(await listRates(ex, B)).toHaveLength(0);
    expect((await consolidate(ex, B, [{ minor: 100n, currency: "USD", date: "2026-02-01" }], "DOP")).status).toBe("sin_tasa");
  });
});

describe("exchange rates / consolidate", () => {
  it("returns an explicit sin_tasa marker without a rate (never estimates)", async () => {
    const r = await consolidate(ex, A, [{ minor: 1000n, currency: "DOP", date: "2026-02-01" }, { minor: 500n, currency: "USD", date: "2026-02-01" }], "DOP");
    expect(r).toEqual({ status: "sin_tasa", currency: "DOP", missing: [{ currency: "USD", date: "2026-02-01" }] });
  });

  it("uses the latest rate on or before the date, never a later one", async () => {
    await saveRate(ex, A, { base: "USD", quote: "DOP", rate: "58.5", date: "2026-02-01" });
    await saveRate(ex, A, { base: "USD", quote: "DOP", rate: "60", date: "2026-03-01" });
    const at = (date: string) => consolidate(ex, A, [{ minor: 10000n, currency: "USD", date }, { minor: 1n, currency: "DOP", date }], "DOP");
    expect(await at("2026-01-31")).toMatchObject({ status: "sin_tasa" });
    expect(await at("2026-02-15")).toMatchObject({ status: "ok", totalMinor: 585001n });
    expect(await at("2026-03-01")).toMatchObject({ status: "ok", totalMinor: 600001n });
  });

  it("converts the other direction exactly with the recorded rate, half away from zero", async () => {
    await saveRate(ex, A, { base: "USD", quote: "DOP", rate: "59", date: "2026-02-01" });
    // 5,900.00 DOP -> 100.00 USD ; 1 cent DOP -> 0.0169 -> 0 ; 30 cents -> 0.508 -> 1
    const c = (minor: bigint) => consolidate(ex, A, [{ minor, currency: "DOP", date: "2026-02-01" }], "USD");
    expect(await c(590000n)).toMatchObject({ totalMinor: 10000n });
    expect(await c(1n)).toMatchObject({ totalMinor: 0n });
    expect(await c(30n)).toMatchObject({ totalMinor: 1n });
    expect(await c(-30n)).toMatchObject({ totalMinor: -1n });
  });

  it("re-saving the same date replaces the rate and audits before/after; invalid rates rejected", async () => {
    await saveRate(ex, A, { base: "USD", quote: "DOP", rate: "59", date: "2026-02-01" });
    await saveRate(ex, A, { base: "USD", quote: "DOP", rate: "60.25", date: "2026-02-01" });
    expect(await listRates(ex, A)).toMatchObject([{ rate: "60.250000" }]);
    const a = (await db.query<{ action: string; before: { rate: string } | null }>(`select action, before from audit_log order by id`)).rows;
    expect(a.map((r) => r.action)).toEqual(["fx.create", "fx.update"]);
    expect(a[1].before).toEqual({ rate: "59.000000" });
    await expect(saveRate(ex, A, { base: "USD", quote: "USD", rate: "1", date: "2026-02-01" })).rejects.toThrow();
    await expect(saveRate(ex, A, { base: "USD", quote: "DOP", rate: "0", date: "2026-02-01" })).rejects.toThrow();
    await expect(saveRate(ex, A, { base: "USD", quote: "DOP", rate: "-3", date: "2026-02-01" })).rejects.toThrow();
  });
});
