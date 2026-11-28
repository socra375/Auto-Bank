import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createAccount, getAccount, listAccounts, totalsByCurrency } from "../../src/server/accounts";
import { netWorth } from "../../src/server/assets";
import { createCategory } from "../../src/server/categories";
import type { Executor } from "../../src/server/executor";
import { createExpense, createIncome, getMovement, listMovements, voidMovement } from "../../src/server/ledger";
import { createLoan, getLoan, listLoans, loanSummary, registerPayment, removeLoan, voidPayment } from "../../src/server/loans";
import { liteExecutor, makeDb } from "../db/helpers";

const h = vi.hoisted(() => ({ owner: vi.fn<() => Promise<string>>(), ex: { current: undefined as unknown } }));
vi.mock("@/lib/auth/guard", () => ({ requireOwner: h.owner }));
vi.mock("@/server/db", () => ({ getExecutor: () => h.ex.current }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));

import { removeLoanAction, voidPaymentAction } from "../../src/lib/actions/loans";
import { voidMovementAction } from "../../src/lib/actions/movements";

let db: PGlite;
let ex: Executor;
const A = "user_a";
const B = "user_b";
beforeEach(async () => {
  db = await makeDb();
  ex = liteExecutor(db);
  h.ex.current = ex;
  h.owner.mockReset();
  h.owner.mockResolvedValue(A);
});

const acct = (u: string, name: string, opening = "1,000.00") =>
  createAccount(ex, u, { name, type: "bank", currency: "DOP", openingBalance: opening, openingDate: "2020-01-01" });
const bal = async (u: string, id: string) => (await getAccount(ex.query, u, id)).balanceMinor;
const flow = async () =>
  (await db.query<{ flow: string; t: string }>(`select flow, sum(amount_minor)::text t from flow_entries where user_id = $1 group by flow order by flow`, [A])).rows;
const lend = (accountId: string | undefined, o: Record<string, unknown> = {}) =>
  createLoan(ex, A, { direction: "receivable", counterparty: "Juan", principal: "1,000.00", currency: "DOP", startDate: "2026-01-10", ...(accountId ? { accountId, funded: true } : {}), ...o });

describe("listMovements: voided movements are hidden by default", () => {
  it("hides the voided original and its reversal; includeVoided shows all; balances and flow never depend on it", async () => {
    const a = await acct(A, "Banco");
    const inc = await createCategory(ex, A, { name: "S", kind: "income" });
    const exp = await createCategory(ex, A, { name: "G", kind: "expense" });
    const keep = await createIncome(ex, A, { accountId: a, categoryId: inc, amount: "500", date: "2026-02-01", description: "keep" });
    const baseBal = await bal(A, a);
    const baseFlow = await flow();
    const { id } = await createExpense(ex, A, { accountId: a, categoryId: exp, amount: "120", date: "2026-02-02", description: "error" });
    const before = { bal: await bal(A, a), flow: await flow(), totals: totalsByCurrency(await listAccounts(ex, A)) };
    expect((await listMovements(ex, A)).items.map((m) => m.description)).toEqual(["error", "keep"]);

    const { reversalId } = await voidMovement(ex, A, id, "mistake");
    expect((await listMovements(ex, A)).items.map((m) => m.id)).toEqual([keep.id]);
    const all = await listMovements(ex, A, { includeVoided: true });
    expect(all.total).toBe(3);
    expect(all.items.map((m) => m.id)).toContain(reversalId);
    expect(all.items.find((m) => m.id === id)!.status).toBe("reversed");
    expect((await listMovements(ex, A, { status: "reversed" })).total).toBe(1); // explicit filters still work
    expect((await listMovements(ex, A, { types: ["reversal"] })).total).toBe(1);

    // the void restores exactly the pre-expense state; listing options change nothing in the ledger
    expect(await bal(A, a)).toBe(baseBal);
    expect(await flow()).toEqual([{ flow: "expense", t: "0" }, ...baseFlow]);
    expect(before.bal).toBe(baseBal - 12000n);
    expect(totalsByCurrency(await listAccounts(ex, A))).toEqual({ DOP: baseBal, USD: 0n });
    expect((await getMovement(ex, A, id)).reversal?.id).toBe(reversalId); // still reachable from the detail page
  });

  it("owner isolation: another user sees nothing, not even with includeVoided", async () => {
    const a = await acct(A, "Banco");
    const inc = await createCategory(ex, A, { name: "S", kind: "income" });
    const { id } = await createIncome(ex, A, { accountId: a, categoryId: inc, amount: "5", date: "2026-02-01", description: "x" });
    await expect(voidMovement(ex, B, id)).rejects.toThrow(/no encontrado/);
    expect((await listMovements(ex, B, { includeVoided: true })).total).toBe(0);
  });
});

describe("removeLoan dispatch", () => {
  it("unfunded loan: cancelled, gone from lists, summaries and net worth", async () => {
    const { id } = await lend(undefined);
    expect((await loanSummary(ex, A)).receivable.DOP).toBe(100000n);
    await removeLoan(ex, A, id, "error");
    expect((await getLoan(ex, A, id)).loan.status).toBe("cancelado");
    expect(await listLoans(ex, A)).toHaveLength(0);
    expect((await loanSummary(ex, A)).receivable.DOP).toBe(0n);
    expect((await netWorth(ex, A)).byCurrency.DOP.receivables).toBe(0n);
  });

  it("funded loan without payments: money returns to the account via a reversal; nothing deleted", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a);
    expect(await bal(A, a)).toBe(0n);
    const txBefore = Number((await db.query<{ n: number }>(`select count(*)::int n from transactions`)).rows[0].n);
    const r = await removeLoan(ex, A, id);
    expect(r.id).toBe(id);
    expect(await bal(A, a)).toBe(100000n);
    expect((await getLoan(ex, A, id)).loan.status).toBe("cancelado");
    expect(Number((await db.query<{ n: number }>(`select count(*)::int n from transactions`)).rows[0].n)).toBe(txBefore + 1);
    expect(await flow()).toEqual([]);
    expect((await loanSummary(ex, A)).receivable.DOP).toBe(0n);
    expect((await netWorth(ex, A)).byCurrency.DOP.receivables).toBe(0n);
  });

  it("with active payments: Spanish error until each payment is voided, then it works", async () => {
    const a = await acct(A, "Banco");
    const { id } = await lend(a);
    const p = await registerPayment(ex, A, id, { accountId: a, date: "2026-02-01", principal: "300" });
    await expect(removeLoan(ex, A, id)).rejects.toThrow("Primero elimina los pagos de este préstamo");
    expect((await getLoan(ex, A, id)).loan.status).not.toBe("cancelado");
    await voidPayment(ex, A, p.id);
    await removeLoan(ex, A, id);
    expect(await bal(A, a)).toBe(100000n);
  });

  it("already cancelled => clear error; other user => not found; bad id => not found", async () => {
    const { id } = await lend(undefined);
    await expect(removeLoan(ex, B, id)).rejects.toThrow(/no encontrado/);
    expect((await getLoan(ex, A, id)).loan.status).not.toBe("cancelado");
    await removeLoan(ex, A, id);
    await expect(removeLoan(ex, A, id)).rejects.toThrow(/ya está eliminado/);
    await expect(removeLoan(ex, A, "nope")).rejects.toThrow(/no encontrado/);
  });
});

describe("delete server actions are guarded", () => {
  const form = (o: Record<string, string> = {}) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

  it("requireOwner runs first: a rejected guard stops the action before any DB work", async () => {
    h.owner.mockRejectedValue(new Error("NEXT_REDIRECT"));
    h.ex.current = undefined; // would throw if touched
    await expect(voidMovementAction("x", null, form())).rejects.toThrow("NEXT_REDIRECT");
    await expect(removeLoanAction("x", null, form())).rejects.toThrow("NEXT_REDIRECT");
    await expect(voidPaymentAction("x", "y", null, form())).rejects.toThrow("NEXT_REDIRECT");
  });

  it("voidMovementAction voids and redirects to an allowed list with a flag; unknown return targets fall back", async () => {
    const a = await acct(A, "Banco");
    const inc = await createCategory(ex, A, { name: "S", kind: "income" });
    const m1 = await createIncome(ex, A, { accountId: a, categoryId: inc, amount: "5", date: "2026-02-01", description: "x" });
    await expect(voidMovementAction(m1.id, null, form({ returnTo: "/gastos?cuenta=1" }))).rejects.toThrow("REDIRECT:/gastos?cuenta=1&eliminado=1");
    const m2 = await createIncome(ex, A, { accountId: a, categoryId: inc, amount: "5", date: "2026-02-01", description: "y" });
    await expect(voidMovementAction(m2.id, null, form({ returnTo: "https://evil.example" }))).rejects.toThrow("REDIRECT:/movimientos?eliminado=1");
    expect((await voidMovementAction(m2.id, null, form()))?.error).toMatch(/ya fue anulado/);
  });

  it("removeLoanAction is scoped to the owner: another user's loan is not found", async () => {
    const { id } = await lend(undefined);
    h.owner.mockResolvedValue(B);
    expect((await removeLoanAction(id, null, form()))?.error).toMatch(/no encontrado/);
    h.owner.mockResolvedValue(A);
    await expect(removeLoanAction(id, null, form({ reason: "error" }))).rejects.toThrow("REDIRECT:/prestamos?eliminado=1");
    expect((await getLoan(ex, A, id)).loan.status).toBe("cancelado");
  });
});
