import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { todayDR } from "../../src/lib/dates";
import { createAccount, listAccounts, totalsByCurrency } from "../../src/server/accounts";
import { netWorth } from "../../src/server/assets";
import { createCategory } from "../../src/server/categories";
import type { Executor } from "../../src/server/executor";
import { createAdjustment, createExpense, createIncome, createTransfer, voidMovement } from "../../src/server/ledger";
import { cancelLoan, createLoan, getLoan, loanSummary, registerPayment, voidLoanOrigination } from "../../src/server/loans";
import {
  allocateShares, balancesByAccount, cashFlow, comparePeriods, expensesByCategory, incomeVsExpense, loansReport, netWorthReport,
  overviewData, previousRange, variation,
} from "../../src/server/reports";
import { liteExecutor, makeDb } from "../db/helpers";

let db: PGlite;
let ex: Executor;
const A = "user_a";
const B = "user_b";
const R = { dateFrom: "2026-03-01", dateTo: "2026-03-31" };
const ids: Record<string, string> = {};

beforeEach(async () => {
  db = await makeDb();
  ex = liteExecutor(db);
  const acct = (u: string, name: string, currency: "DOP" | "USD", opening: string, type: "bank" | "savings" = "bank") =>
    createAccount(ex, u, { name, type, currency, openingBalance: opening, openingDate: "2026-01-01" }) as Promise<string>;
  const dop = await acct(A, "Banco DOP", "DOP", "10,000.00");
  const sav = await acct(A, "Ahorro DOP", "DOP", "5,000.00", "savings");
  const usd = await acct(A, "Banco USD", "USD", "1,000.00");
  Object.assign(ids, { dop, sav, usd });
  const cat = (name: string, kind: "income" | "expense") => createCategory(ex, A, { name, kind }) as Promise<string>;
  const [salary, food, transport] = [await cat("Salario", "income"), await cat("Comida", "expense"), await cat("Transporte", "expense")];
  const inc = (accountId: string, amount: string, date: string) => createIncome(ex, A, { accountId, categoryId: salary, amount, date, description: "Ingreso" });
  const exp = (accountId: string, categoryId: string, amount: string, date: string) => createExpense(ex, A, { accountId, categoryId, amount, date, description: "Gasto" });
  await inc(dop, "3,000.00", "2026-03-05");
  await exp(dop, food, "500.00", "2026-03-06");
  await exp(dop, transport, "300.00", "2026-03-07");
  await exp(dop, food, "200.00", "2026-03-20");
  const voided = await exp(dop, food, "100.00", "2026-03-10");
  await voidMovement(ex, A, voided.id, "error");
  await inc(usd, "200.00", "2026-03-08");
  await exp(usd, food, "50.00", "2026-03-09");
  await createTransfer(ex, A, { fromAccountId: dop, toAccountId: sav, amount: "400.00", date: "2026-03-11", description: "Ahorro" });
  await createTransfer(ex, A, { fromAccountId: dop, toAccountId: usd, amount: "600.00", amountIn: "10.00", fxRate: "60", date: "2026-03-12", description: "Cambio" });
  await createAdjustment(ex, A, { accountId: dop, direction: "increase", amount: "50.00", date: "2026-03-13", description: "Ajuste" });
  const lend = await createLoan(ex, A, { direction: "receivable", counterparty: "Juan", principal: "1,000.00", currency: "DOP", startDate: "2026-03-01", dueDate: "2099-12-31", accountId: dop, funded: true });
  await registerPayment(ex, A, lend.id, { accountId: dop, date: "2026-03-15", principal: "400.00", interest: "60.00" });
  const borrow = await createLoan(ex, A, { direction: "payable", counterparty: "Banco", principal: "2,000.00", currency: "DOP", startDate: "2026-03-02", dueDate: "2099-12-31", accountId: dop, funded: true });
  await registerPayment(ex, A, borrow.id, { accountId: dop, date: "2026-03-16", principal: "500.00", interest: "80.00" });
  const ghost = await createLoan(ex, A, { direction: "receivable", counterparty: "Error", principal: "700.00", currency: "DOP", startDate: "2026-03-03" });
  await cancelLoan(ex, A, ghost.id, "por error");
  const usdLoan = await createLoan(ex, A, { direction: "receivable", counterparty: "Pedro", principal: "100.00", currency: "USD", startDate: "2026-03-04", accountId: usd, funded: true });
  const origin = (await getLoan(ex, A, usdLoan.id)).movements[0];
  await voidLoanOrigination(ex, A, origin.id);
});

const sumEntries = async (currency: string) =>
  BigInt((await db.query<{ s: string }>(`select coalesce(sum(amount_minor),0)::text s from entries where user_id=$1 and currency=$2 and date between '2026-03-01' and '2026-03-31'`, [A, currency])).rows[0].s);

describe("incomeVsExpense", () => {
  it("excludes transfers, adjustments and loan principal; counts interest by direction; reversals net", async () => {
    const r = await incomeVsExpense(ex, A, R);
    const dop = r.byCurrency.find((c) => c.currency === "DOP")!;
    expect(dop.incomeMinor).toBe(306_000n); // 3,000 salary + 60 interest collected; NOT the 1,000 lent, 2,000 borrowed, transfers or +50 adjustment
    expect(dop.expenseMinor).toBe(108_000n); // 500+300+200 + 80 interest paid; the voided 100 nets to zero
    expect(dop.netMinor).toBe(198_000n);
  });
  it("keeps currencies apart", async () => {
    const usd = (await incomeVsExpense(ex, A, R)).byCurrency.find((c) => c.currency === "USD")!;
    expect([usd.incomeMinor, usd.expenseMinor]).toEqual([20_000n, 5_000n]);
    const only = await incomeVsExpense(ex, A, { ...R, currency: "USD" });
    expect(only.byCurrency.map((c) => c.currency)).toEqual(["USD"]);
  });
  it("buckets by day, ISO week and month; series sums to totals; account filter narrows", async () => {
    const week = (await incomeVsExpense(ex, A, { ...R, granularity: "week", currency: "DOP" })).byCurrency[0];
    expect(week.series.map((p) => p.bucket)).toContain("2026-03-02"); // Mon of the week of Thu 2026-03-05
    expect(week.series.reduce((a, p) => a + p.incomeMinor, 0n)).toBe(week.incomeMinor);
    const month = (await incomeVsExpense(ex, A, { ...R, granularity: "month", currency: "DOP" })).byCurrency[0];
    expect(month.series.map((p) => p.bucket)).toEqual(["2026-03-01"]);
    const day = (await incomeVsExpense(ex, A, { ...R, granularity: "day", currency: "DOP" })).byCurrency[0];
    expect(day.series.length).toBeGreaterThan(3);
    const acc = (await incomeVsExpense(ex, A, { ...R, accountId: ids.sav })).byCurrency[0];
    expect(acc.incomeMinor).toBe(0n);
  });
  it("is empty outside the period and rejects an inverted range", async () => {
    const r = await incomeVsExpense(ex, A, { dateFrom: "2025-01-01", dateTo: "2025-01-31" });
    expect(r.byCurrency.every((c) => c.series.length === 0 && c.netMinor === 0n)).toBe(true);
    await expect(incomeVsExpense(ex, A, { dateFrom: "2026-04-01", dateTo: "2026-03-01" })).rejects.toThrow();
  });
});

describe("cashFlow", () => {
  it("= income - expense + loan principal + adjustments (+ transfers) and equals the sum of entries", async () => {
    const r = await cashFlow(ex, A, R);
    const dop = r.byCurrency.find((c) => c.currency === "DOP")!;
    expect(dop.lines).toEqual({
      income: 306_000n, expense: -108_000n,
      loanPrincipal: 90_000n, // -1000 lent +400 collected +2000 borrowed -500 repaid
      adjustments: 5_000n,
      transfersInternal: 0n, // DOP -> savings nets to zero
      transfersFx: -60_000n, // cross-currency transfer is its own line
    });
    expect(dop.netMinor).toBe(233_000n);
    expect(dop.netMinor).toBe(await sumEntries("DOP"));
    const usd = r.byCurrency.find((c) => c.currency === "USD")!;
    expect(usd.lines.transfersFx).toBe(1_000n);
    expect(usd.lines.loanPrincipal).toBe(0n); // cancelled loan: origination and reversal cancel out
    expect(usd.netMinor).toBe(await sumEntries("USD"));
    expect(dop.series.reduce((a, p) => a + p.netMinor, 0n)).toBe(dop.netMinor);
  });
  it("a same-currency transfer shows on each side only when an account filter is applied", async () => {
    const sav = (await cashFlow(ex, A, { ...R, accountId: ids.sav })).byCurrency.find((c) => c.currency === "DOP")!;
    expect(sav.lines.transfersInternal).toBe(40_000n);
  });
});

describe("balancesByAccount", () => {
  it("equals the account_balances view for a date past the last entry", async () => {
    const r = await balancesByAccount(ex, A, { asOf: "2099-01-01" });
    const view = (await db.query<{ account_id: string; balance_minor: string }>(`select account_id, balance_minor::text from account_balances where user_id=$1`, [A])).rows;
    expect(r.rows.length).toBe(view.length);
    for (const v of view) expect(r.rows.find((x) => x.accountId === v.account_id)!.balanceMinor).toBe(BigInt(v.balance_minor));
  });
  it("is historical: balance of the bank account on 2026-03-10", async () => {
    const r = await balancesByAccount(ex, A, { asOf: "2026-03-10" });
    expect(r.rows.find((x) => x.accountId === ids.dop)!.balanceMinor).toBe(1_320_000n); // 10,000 -1,000 +2,000 +3,000 -500 -300 (void of 100 nets)
  });
  it("active totals per currency equal the accounts service, and shares sum to 100%", async () => {
    const r = await balancesByAccount(ex, A, { asOf: "2099-01-01" });
    expect(r.activeTotals).toEqual(totalsByCurrency(await listAccounts(ex, A)));
    const dop = r.rows.filter((x) => x.currency === "DOP" && x.balanceMinor > 0n);
    expect(dop.reduce((a, x) => a + x.shareOfActivePermille, 0)).toBe(1000);
  });
});

describe("expensesByCategory", () => {
  it("nets the reversal, shows loan interest on its own row and shares sum to exactly 100% per currency", async () => {
    const r = await expensesByCategory(ex, A, R);
    const dop = r.byCurrency.find((c) => c.currency === "DOP")!;
    expect(dop.items.map((i) => [i.name, i.amountMinor])).toEqual([["Comida", 70_000n], ["Transporte", 30_000n], ["Interés de préstamos", 8_000n]]);
    expect(dop.totalMinor).toBe(108_000n);
    for (const c of r.byCurrency) expect(c.items.reduce((a, i) => a + i.sharePermille, 0)).toBe(1000);
    expect(r.byCurrency.find((c) => c.currency === "USD")!.items.map((i) => i.name)).toEqual(["Comida"]);
  });
  it("allocateShares always sums to 1000 and handles empty/zero totals", () => {
    expect(allocateShares([1n, 1n, 1n]).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(allocateShares([])).toEqual([]);
    expect(allocateShares([0n])).toEqual([0]);
  });
});

describe("loansReport", () => {
  it("pending, overdue and interest by direction; cancelled excluded; equals loanSummary", async () => {
    const r = await loansReport(ex, A, R);
    const dop = r.byCurrency.find((c) => c.currency === "DOP")!;
    expect(dop.receivable).toEqual({ count: 1, outstandingMinor: 60_000n }); // 1,000 - 400; the cancelled 700 never counts
    expect(dop.payable).toEqual({ count: 1, outstandingMinor: 150_000n });
    expect(dop.overdueReceivable.count + dop.overduePayable.count).toBe(0);
    expect([dop.interestCollectedMinor, dop.interestPaidMinor]).toEqual([6_000n, 8_000n]);
    const usd = r.byCurrency.find((c) => c.currency === "USD")!;
    expect(usd.receivable).toEqual({ count: 0, outstandingMinor: 0n });
    const s = await loanSummary(ex, A);
    expect([dop.receivable.outstandingMinor, dop.payable.outstandingMinor]).toEqual([s.receivable.DOP, s.payable.DOP]);
    expect(dop.interestCollectedMinor).toBe(s.interestCollected.DOP);
  });
  it("interest respects the period", async () => {
    const r = await loansReport(ex, A, { dateFrom: "2026-04-01", dateTo: "2026-04-30" });
    expect(r.byCurrency.every((c) => c.interestCollectedMinor === 0n && c.interestPaidMinor === 0n)).toBe(true);
  });
});

describe("comparePeriods", () => {
  it("never divides by zero", async () => {
    expect(variation(0n, 500n)).toEqual({ a: 0n, b: 500n, absMinor: 500n, pctTenths: null });
    expect(variation(0n, 0n).pctTenths).toBeNull();
    expect(variation(1000n, 1500n).pctTenths).toBe(500n);
    expect(variation(-1000n, -500n).pctTenths).toBe(500n);
    expect(variation(1000n, 0n).pctTenths).toBe(-1000n);
    const r = await comparePeriods(ex, A, { a: previousRange({ from: "2026-03-01", to: "2026-03-31" }), b: { from: "2026-03-01", to: "2026-03-31" } });
    expect(r.a).toEqual({ from: "2026-01-29", to: "2026-02-28" });
    const dop = r.byCurrency.find((c) => c.currency === "DOP")!;
    expect(dop.income).toEqual({ a: 0n, b: 306_000n, absMinor: 306_000n, pctTenths: null });
    expect(JSON.stringify(r, (_, v) => (typeof v === "bigint" ? v.toString() : v))).not.toMatch(/Infinity|NaN/);
  });
  it("identical periods give 0%", async () => {
    const p = { from: "2026-03-01", to: "2026-03-31" };
    const dop = (await comparePeriods(ex, A, { a: p, b: p })).byCurrency.find((c) => c.currency === "DOP")!;
    expect(dop.net.pctTenths).toBe(0n);
  });
});

describe("overview and net worth", () => {
  it("composes exactly the underlying services", async () => {
    const o = await overviewData(ex, A, { period: "anio" }, "2026-03-31");
    expect(o.period).toMatchObject({ from: "2026-01-01", to: "2026-03-31", granularity: "month" });
    expect(o.netWorth.byCurrency).toEqual((await netWorth(ex, A)).byCurrency);
    expect(o.loans).toEqual(await loanSummary(ex, A));
    expect(o.disponible).toEqual(totalsByCurrency(await listAccounts(ex, A)));
    expect(o.flow.byCurrency.find((c) => c.currency === "DOP")!.incomeMinor).toBe(306_000n);
    expect(o.recent.length).toBeLessThanOrEqual(10);
    expect(o.recent.length).toBeGreaterThan(0);
    expect(o.due.map((l) => l.counterparty)).toEqual([]); // nothing due within 30 days of today
  });
  it("applies the currency filter", async () => {
    const o = await overviewData(ex, A, { period: "anio", currency: "USD" }, "2026-03-31");
    expect(o.currencies).toEqual(["USD"]);
    expect(o.flow.byCurrency.map((c) => c.currency)).toEqual(["USD"]);
    expect(o.distribution.rows.every((r) => r.currency === "USD")).toBe(true);
    expect(o.recent.every((m) => m.legs.some((l) => l.currency === "USD"))).toBe(true);
  });
  it("lists loans due soon", async () => {
    const d = new Date(`${todayDR()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 5);
    await createLoan(ex, A, { direction: "payable", counterparty: "Pronto", principal: "10.00", currency: "DOP", startDate: "2020-01-01", dueDate: d.toISOString().slice(0, 10) });
    expect((await overviewData(ex, A)).due.map((l) => l.counterparty)).toEqual(["Pronto"]);
  });
  it("netWorthReport reuses the patrimonio services", async () => {
    const r = await netWorthReport(ex, A, { months: 3 });
    expect(r.evolution).toHaveLength(3);
    expect(r.current.byCurrency).toEqual((await netWorth(ex, A)).byCurrency);
  });
});

describe("tenant isolation and empty data", () => {
  it("never mixes users", async () => {
    const b = (await createAccount(ex, B, { name: "B", type: "bank", currency: "DOP", openingBalance: "1.00", openingDate: "2026-01-01" })) as string;
    const cat = (await createCategory(ex, B, { name: "X", kind: "expense" })) as string;
    await createExpense(ex, B, { accountId: b, categoryId: cat, amount: "7.00", date: "2026-03-05", description: "b" });
    const r = await incomeVsExpense(ex, B, R);
    expect(r.byCurrency.find((c) => c.currency === "DOP")!.expenseMinor).toBe(700n);
    expect((await expensesByCategory(ex, B, R)).byCurrency[0].items.map((i) => i.name)).toEqual(["X"]);
    expect((await balancesByAccount(ex, B)).rows.map((x) => x.name)).toEqual(["B"]);
    expect((await loansReport(ex, B, R)).byCurrency.every((c) => c.receivable.count === 0)).toBe(true);
    // A's accountId used by B matches nothing
    expect((await incomeVsExpense(ex, B, { ...R, accountId: ids.dop })).byCurrency.every((c) => c.series.length === 0)).toBe(true);
    const o = await overviewData(ex, B);
    expect(o.recent).toHaveLength(1);
  });
  it("a user with no data gets zeros, not fake numbers", async () => {
    const o = await overviewData(ex, "nobody", { period: "30d" }, "2026-03-31");
    expect(o.recent).toEqual([]);
    expect(o.disponible).toEqual({ DOP: 0n, USD: 0n });
    expect(o.flow.byCurrency.every((c) => c.series.length === 0)).toBe(true);
  });
});
