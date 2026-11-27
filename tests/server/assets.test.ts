import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { todayDR } from "../../src/lib/dates";
import { createAccount } from "../../src/server/accounts";
import {
  addValuation, createAsset, disposeAsset, getAsset, listAssets, netWorth, netWorthEvolution, updateAsset, valuationSeries,
} from "../../src/server/assets";
import type { Executor } from "../../src/server/executor";
import { saveRate } from "../../src/server/fx";
import { createLoan } from "../../src/server/loans";
import { liteExecutor, makeDb } from "../db/helpers";

let db: PGlite;
let ex: Executor;
const A = "user_a";
const B = "user_b";

beforeEach(async () => {
  db = await makeDb();
  ex = liteExecutor(db);
});

const count = async (t: string) => Number((await db.query<{ n: number }>(`select count(*)::int n from ${t}`)).rows[0].n);
const actions = async (u = A) => (await db.query<{ action: string }>(`select action from audit_log where user_id=$1 order by id`, [u])).rows.map((r) => r.action);
const house = (o: Record<string, unknown> = {}) =>
  createAsset(ex, A, { name: "Casa", type: "real_estate", currency: "DOP", initialValue: "1,000,000.00", valuedOn: "2026-01-01", ...o });
const current = async (id: string, u = A) => (await getAsset(ex, u, id)).asset.currentValueMinor;

describe("valuations are append-only", () => {
  it("createAsset inserts asset + first valuation + audit; a new value adds a row and keeps the old ones", async () => {
    const { id } = await house();
    expect(await count("asset_valuations")).toBe(1);
    await addValuation(ex, A, id, { value: "1,200,000.00", valuedOn: "2026-06-01", source: "tasación" });
    const d = await getAsset(ex, A, id);
    expect(d.valuations.map((v) => v.valueMinor)).toEqual([120000000n, 100000000n]);
    expect(d.asset.currentValueMinor).toBe(120000000n);
    expect(await actions()).toEqual(["asset.create", "asset.valuation"]);
    expect(d.history.map((h) => h.action)).toEqual(["asset.create", "asset.valuation"]);
  });

  it("the DB rejects update and delete of a valuation", async () => {
    const { id } = await house();
    await expect(db.query(`update asset_valuations set value_minor = 1 where asset_id = $1`, [id])).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from asset_valuations where asset_id = $1`, [id])).rejects.toThrow(/append-only/);
  });

  it("latest = greatest valued_on, even when a backdated value is inserted later; ties go to the newest insert", async () => {
    const { id } = await house(); // 2026-01-01: 1,000,000.00
    await addValuation(ex, A, id, { value: "1,500,000.00", valuedOn: "2026-06-01" });
    await addValuation(ex, A, id, { value: "900,000.00", valuedOn: "2026-03-01" }); // backdated: must NOT become current
    expect(await current(id)).toBe(150000000n);
    await addValuation(ex, A, id, { value: "1,600,000.00", valuedOn: "2026-06-01" }); // same day, inserted later
    expect(await current(id)).toBe(160000000n);
    const s = await valuationSeries(ex, A, id);
    expect(s.currency).toBe("DOP");
    expect(s.points.map((p) => p.valuedOn)).toEqual(["2026-01-01", "2026-03-01", "2026-06-01", "2026-06-01"]);
  });

  it("rejects future dates and valuations on disposed assets", async () => {
    const { id } = await house();
    const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    await expect(addValuation(ex, A, id, { value: "1.00", valuedOn: future })).rejects.toMatchObject({ code: "FUTURE_DATE" });
    await disposeAsset(ex, A, id, { disposedOn: todayDR() });
    await expect(addValuation(ex, A, id, { value: "1.00", valuedOn: "2026-02-01" })).rejects.toMatchObject({ code: "ASSET_DISPOSED" });
  });
});

describe("asset metadata, currency, disposal", () => {
  it("updateAsset changes name/description only; currency stays and the DB-visible row is unchanged otherwise", async () => {
    const { id } = await house({ acquisitionCost: "800,000.00" });
    await updateAsset(ex, A, id, { name: "Casa Playa", description: "Sosúa", currency: "USD", type: "other" } as never);
    const a = (await getAsset(ex, A, id)).asset;
    expect([a.name, a.description, a.currency, a.type, a.acquisitionCostMinor]).toEqual(["Casa Playa", "Sosúa", "DOP", "real_estate", 80000000n]);
    expect(await actions()).toContain("asset.update");
  });

  it("disposeAsset keeps the asset and its history, requires an active asset, and audits", async () => {
    const { id } = await house();
    await disposeAsset(ex, A, id, { disposedOn: "2026-05-01", note: "vendida" });
    const d = await getAsset(ex, A, id);
    expect([d.asset.status, d.asset.disposedOn, d.valuations.length]).toEqual(["disposed", "2026-05-01", 1]);
    await expect(disposeAsset(ex, A, id, { disposedOn: "2026-05-02" })).rejects.toMatchObject({ code: "ALREADY_DISPOSED" });
    expect(await actions()).toEqual(["asset.create", "asset.dispose"]);
    expect(await count("assets")).toBe(1); // never deleted
  });

  it("listAssets filters by type/status/currency", async () => {
    await house();
    await createAsset(ex, A, { name: "Jeep", type: "vehicle", currency: "USD", initialValue: "20,000.00", valuedOn: "2026-01-01" });
    const gone = await createAsset(ex, A, { name: "Laptop", type: "technology", currency: "USD", initialValue: "500.00", valuedOn: "2026-01-01" });
    await disposeAsset(ex, A, gone.id, { disposedOn: "2026-02-01" });
    const names = async (f: object) => (await listAssets(ex, A, f)).map((a) => a.name);
    expect(await names({})).toEqual(["Casa", "Jeep", "Laptop"]);
    expect(await names({ type: "vehicle" })).toEqual(["Jeep"]);
    expect(await names({ status: "disposed" })).toEqual(["Laptop"]);
    expect(await names({ currency: "USD", status: "active" })).toEqual(["Jeep"]);
    expect((await listAssets(ex, A, { type: "vehicle" }))[0].currentValueMinor).toBe(2000000n);
  });
});

describe("isolation, idempotency, atomicity", () => {
  it("another user cannot see or modify the asset", async () => {
    const { id } = await house();
    await expect(getAsset(ex, B, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addValuation(ex, B, id, { value: "1.00", valuedOn: "2026-02-01" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateAsset(ex, B, id, { name: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(disposeAsset(ex, B, id, { disposedOn: "2026-02-01" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(valuationSeries(ex, B, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listAssets(ex, B)).toEqual([]);
    expect(await count("asset_valuations")).toBe(1);
  });

  it("same idempotency key returns the same row and writes nothing twice", async () => {
    const a1 = await house({ idempotencyKey: "asset-key-1" });
    const a2 = await house({ idempotencyKey: "asset-key-1" });
    expect([a2.duplicate, a2.id]).toEqual([true, a1.id]);
    const v1 = await addValuation(ex, A, a1.id, { value: "2.00", valuedOn: "2026-02-01", idempotencyKey: "val-key-1" });
    const v2 = await addValuation(ex, A, a1.id, { value: "2.00", valuedOn: "2026-02-01", idempotencyKey: "val-key-1" });
    expect([v2.duplicate, v2.id]).toEqual([true, v1.id]);
    expect([await count("assets"), await count("asset_valuations"), await count("audit_log")]).toEqual([1, 2, 2]);
  });

  it("a failure after the asset insert rolls back asset, valuation and audit", async () => {
    await expect(createAsset(ex, A, { name: "Casa", type: "real_estate", currency: "DOP", initialValue: "1.00", valuedOn: "2026-01-01", acquisitionCost: "1.00", acquiredOn: "not-a-date" } as never)).rejects.toThrow();
    // force a failure AFTER both inserts, at the audit write
    const failing: Executor = { query: ex.query, transaction: (fn) => ex.transaction((q) => fn(async (sql, p) => {
      if (sql.includes("insert into audit_log")) throw new Error("boom");
      return q(sql, p);
    })) };
    await expect(createAsset(failing, A, { name: "Casa", type: "real_estate", currency: "DOP", initialValue: "1.00", valuedOn: "2026-01-01" })).rejects.toThrow("boom");
    expect([await count("assets"), await count("asset_valuations"), await count("audit_log")]).toEqual([0, 0, 0]);
  });
});

describe("net worth", () => {
  const setup = async () => {
    const dop = await createAccount(ex, A, { name: "Banco", type: "bank", currency: "DOP", openingBalance: "100,000.00", openingDate: "2020-01-01" });
    await createAccount(ex, A, { name: "Wise", type: "bank", currency: "USD", openingBalance: "1,000.00", openingDate: "2020-01-01" });
    await house(); // DOP 1,000,000.00
    await createAsset(ex, A, { name: "Jeep", type: "vehicle", currency: "USD", initialValue: "20,000.00", valuedOn: "2026-01-01" });
    await createLoan(ex, A, { direction: "payable", counterparty: "Banco X", principal: "50,000.00", currency: "DOP", startDate: "2026-01-10" });
    await createLoan(ex, A, { direction: "receivable", counterparty: "Juan", principal: "200.00", currency: "USD", startDate: "2026-01-10" });
    return dop;
  };

  it("is computed per currency with accounts + assets - payables + receivables; DOP and USD never mix", async () => {
    await setup();
    const nw = await netWorth(ex, A);
    expect(nw.byCurrency.DOP).toEqual({ accounts: 10000000n, assets: 100000000n, grossAssets: 110000000n, payables: 5000000n, receivables: 0n, net: 105000000n });
    expect(nw.byCurrency.USD).toEqual({ accounts: 100000n, assets: 2000000n, grossAssets: 2100000n, payables: 0n, receivables: 20000n, net: 2120000n });
    expect(nw.consolidated).toBeUndefined();
  });

  it("matches the account_balances / loan_balances / asset_current_values views", async () => {
    await setup();
    const nw = await netWorth(ex, A);
    const one = async (sql: string) => BigInt((await db.query<{ t: string }>(sql, [A])).rows[0].t);
    expect(await one(`select sum(balance_minor)::text t from account_balances where user_id=$1 and currency='DOP' and status='active'`)).toBe(nw.byCurrency.DOP.accounts);
    expect(await one(`select sum(outstanding_minor)::text t from loan_balances where user_id=$1 and currency='USD' and direction='receivable'`)).toBe(nw.byCurrency.USD.receivables);
    expect(await one(`select sum(value_minor)::text t from asset_current_values where user_id=$1 and currency='USD'`)).toBe(nw.byCurrency.USD.assets);
  });

  it("consolidate returns sin_tasa without a rate and the exact figure with one", async () => {
    await setup();
    const none = await netWorth(ex, A, { baseCurrency: "DOP" });
    expect(none.consolidated?.figures.net.status).toBe("sin_tasa");
    await saveRate(ex, A, { base: "USD", quote: "DOP", rate: "60", date: "2026-01-01" });
    const ok = await netWorth(ex, A, { baseCurrency: "DOP" });
    const net = ok.consolidated!.figures.net;
    expect(net.status === "ok" && net.totalMinor).toBe(105000000n + 2120000n * 60n); // DOP net + USD net * 60
    const gross = ok.consolidated!.figures.grossAssets;
    expect(gross.status === "ok" && gross.totalMinor).toBe(110000000n + 2100000n * 60n);
  });

  it("disposed assets and other users' data are excluded; archived accounts still count", async () => {
    await setup();
    const jeep = (await listAssets(ex, A, { type: "vehicle" }))[0];
    await disposeAsset(ex, A, jeep.id, { disposedOn: "2026-03-01" });
    const bAcc = await createAccount(ex, B, { name: "Otro", type: "cash", currency: "USD", openingBalance: "9,999.00", openingDate: "2020-01-01" });
    expect(bAcc).toBeTruthy();
    const nw = await netWorth(ex, A);
    expect(nw.byCurrency.USD.assets).toBe(0n);
    expect(nw.byCurrency.USD.accounts).toBe(100000n);
    await db.query(`update accounts set status='archived' where user_id=$1 and name='Wise'`, [A]);
    // archiving hides the account but its balance must stay in net worth
    expect((await netWorth(ex, A)).byCurrency.USD.accounts).toBe(100000n);
  });

  it("asOf uses the valuation, loan principal and entries valid on that date", async () => {
    const acc = await setup();
    const { id } = (await listAssets(ex, A, { type: "real_estate" }))[0];
    await addValuation(ex, A, id, { value: "2,000,000.00", valuedOn: "2026-06-01" });
    const jan = await netWorth(ex, A, { asOf: "2026-03-01" });
    expect(jan.byCurrency.DOP.assets).toBe(100000000n);
    expect((await netWorth(ex, A, { asOf: "2026-07-01" })).byCurrency.DOP.assets).toBe(200000000n);
    expect((await netWorth(ex, A, { asOf: "2026-01-05" })).byCurrency.DOP.payables).toBe(0n); // loan starts 01-10
    // partial repayment dated 2026-04-01 reduces the payable only from that date on
    const { registerPayment } = await import("../../src/server/loans");
    const loanId = (await db.query<{ id: string }>(`select id from loans where user_id=$1 and direction='payable'`, [A])).rows[0].id;
    await registerPayment(ex, A, loanId, { accountId: acc, date: "2026-04-01", principal: "20,000.00" });
    expect((await netWorth(ex, A, { asOf: "2026-03-31" })).byCurrency.DOP.payables).toBe(5000000n);
    expect((await netWorth(ex, A, { asOf: "2026-04-01" })).byCurrency.DOP.payables).toBe(3000000n);
    // a far-future asOf equals "current"
    expect((await netWorth(ex, A, { asOf: "2999-01-01" })).byCurrency).toEqual((await netWorth(ex, A)).byCurrency);
    // disposed asset still counts before its disposal date
    await disposeAsset(ex, A, id, { disposedOn: "2026-08-01" });
    expect((await netWorth(ex, A, { asOf: "2026-07-31" })).byCurrency.DOP.assets).toBe(200000000n);
    expect((await netWorth(ex, A, { asOf: "2026-08-01" })).byCurrency.DOP.assets).toBe(0n);
  });

  it("netWorthEvolution returns one point per month ending today, oldest first", async () => {
    await setup();
    const ev = await netWorthEvolution(ex, A, 3);
    expect(ev).toHaveLength(3);
    expect(ev.map((p) => p.date)).toEqual([...ev.map((p) => p.date)].sort());
    expect(ev[2].date).toBe(todayDR());
    expect(ev[2].byCurrency).toEqual((await netWorth(ex, A, { asOf: todayDR() })).byCurrency);
  });
});
