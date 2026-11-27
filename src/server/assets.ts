import type { z } from "zod";
import { todayDR } from "@/lib/dates";
import { CURRENCIES, emptyTotals, type Currency, type TotalsByCurrency } from "@/lib/money";
import { audit } from "./audit";
import { DomainError, isUniqueViolation, notFound } from "./errors";
import { assertSameRequest, requestHash } from "./request-hash";
import type { Executor, Query, Row } from "./executor";
import { consolidate, type Consolidated } from "./fx";
import type { AuditEntry } from "./ledger";
import {
  assetCreateSchema, assetDisposeSchema, assetEditSchema, assetFiltersSchema, assetValuationSchema, idSchema,
  type AssetCreateInput, type AssetFilters, type AssetValuationInput,
} from "./schemas";

export type AssetType = "real_estate" | "vehicle" | "technology" | "furniture" | "other";
export type AssetStatus = "active" | "disposed";

export interface AssetRow {
  id: string; name: string; type: AssetType; currency: Currency; description: string | null;
  status: AssetStatus; acquiredOn: string | null; acquisitionCostMinor: bigint | null; disposedOn: string | null;
  /** Latest valuation (max valued_on, then seq) from the asset_current_values view. */
  currentValueMinor: bigint | null; currentValuedOn: string | null;
}
export interface ValuationRow {
  id: string; valueMinor: bigint; valuedOn: string; source: string | null; note: string | null; createdAt: string;
}

const SELECT = `
  select a.id, a.name, a.type::text as type, a.currency::text as currency, a.description, a.status::text as status,
         a.acquired_on::text as acquired_on, a.acquisition_cost_minor::text as cost, a.disposed_on::text as disposed_on,
         c.value_minor::text as current_value, c.valued_on::text as current_valued_on
  from assets a left join asset_current_values c on c.asset_id = a.id`;

const map = (r: Row): AssetRow => ({
  id: r.id as string, name: r.name as string, type: r.type as AssetType, currency: r.currency as Currency,
  description: (r.description as string | null) ?? null, status: r.status as AssetStatus,
  acquiredOn: (r.acquired_on as string | null) ?? null,
  acquisitionCostMinor: r.cost == null ? null : BigInt(r.cost as string),
  disposedOn: (r.disposed_on as string | null) ?? null,
  currentValueMinor: r.current_value == null ? null : BigInt(r.current_value as string),
  currentValuedOn: (r.current_valued_on as string | null) ?? null,
});

// ---- writes -------------------------------------------------------------------

const byKey = (table: "assets" | "asset_valuations") => async (q: Query, userId: string, key: string) => {
  const r = (await q(`select id, request_hash from ${table} where user_id = $1 and idempotency_key = $2`, [userId, key])).rows[0];
  return r ? { id: r.id as string, hash: r.request_hash as string | null } : null;
};
const assetByKey = byKey("assets");
const valuationByKey = byKey("asset_valuations");

function notFuture(date: string, what: string) {
  if (date > todayDR()) throw new DomainError("FUTURE_DATE", `${what} no puede ser una fecha futura.`);
}

/** Creates the asset AND its first valuation in ONE transaction. Currency is fixed here and never changes. */
export async function createAsset(ex: Executor, userId: string, raw: AssetCreateInput): Promise<{ id: string; duplicate: boolean }> {
  const i = assetCreateSchema.parse(raw);
  const key = i.idempotencyKey;
  notFuture(i.valuedOn, "La fecha de valoración");
  const hash = requestHash("asset", i);
  try {
    return await ex.transaction(async (q) => {
      if (key) {
        const existing = await assetByKey(q, userId, key);
        if (existing) { assertSameRequest(existing.hash, hash); return { id: existing.id, duplicate: true }; }
      }
      const r = await q(
        `insert into assets (user_id, name, type, currency, acquired_on, acquisition_cost_minor, description, idempotency_key, request_hash)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [userId, i.name, i.type, i.currency, i.acquiredOn ?? null, i.acquisitionCost?.toString() ?? null, i.description ?? null, key ?? null, key ? hash : null],
      );
      const id = r.rows[0].id as string;
      const v = await q(
        `insert into asset_valuations (asset_id, user_id, value_minor, valued_on, source) values ($1,$2,$3,$4,'valor inicial') returning id`,
        [id, userId, i.initialValue.toString(), i.valuedOn],
      );
      await audit(q, userId, "asset.create", "asset", id, null, { ...i, valuationId: v.rows[0].id });
      return { id, duplicate: false };
    });
  } catch (e) {
    if (key && isUniqueViolation(e)) {
      const existing = await assetByKey(ex.query, userId, key); // lost a race with the same key
      if (existing) { assertSameRequest(existing.hash, hash); return { id: existing.id, duplicate: true }; }
    }
    throw e;
  }
}

/**
 * Appends a valuation row; NEVER edits or deletes one (DB triggers forbid it). Backdating is allowed:
 * the "current" value is the row with the greatest valued_on, ties broken by insertion order (seq).
 */
export async function addValuation(ex: Executor, userId: string, assetId: string, raw: AssetValuationInput): Promise<{ id: string; duplicate: boolean }> {
  const i = assetValuationSchema.parse(raw);
  const key = i.idempotencyKey;
  if (!idSchema.safeParse(assetId).success) throw notFound("Bien");
  notFuture(i.valuedOn, "La fecha de valoración");
  const vHash = requestHash(`asset:${assetId}`, i);
  try {
    return await ex.transaction(async (q) => {
      const a = await q(`select status::text as status from assets where id = $1 and user_id = $2 for update`, [assetId, userId]);
      if (!a.rows[0]) throw notFound("Bien");
      if (key) {
        const existing = await valuationByKey(q, userId, key);
        if (existing) { assertSameRequest(existing.hash, vHash); return { id: existing.id, duplicate: true }; }
      }
      if (a.rows[0].status === "disposed") throw new DomainError("ASSET_DISPOSED", "El bien fue dado de baja y no admite nuevas valoraciones.");
      const prev = await q(`select value_minor::text as v, valued_on::text as d from asset_current_values where asset_id = $1`, [assetId]);
      const r = await q(
        `insert into asset_valuations (asset_id, user_id, value_minor, valued_on, source, note, idempotency_key, request_hash)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [assetId, userId, i.value.toString(), i.valuedOn, i.source ?? null, i.note ?? null, key ?? null, key ? vHash : null],
      );
      const id = r.rows[0].id as string;
      await audit(q, userId, "asset.valuation", "asset", assetId,
        prev.rows[0] ? { valueMinor: BigInt(prev.rows[0].v as string), valuedOn: prev.rows[0].d } : null,
        { valuationId: id, valueMinor: i.value, valuedOn: i.valuedOn, source: i.source ?? null, note: i.note ?? null });
      return { id, duplicate: false };
    });
  } catch (e) {
    if (key && isUniqueViolation(e)) {
      const existing = await valuationByKey(ex.query, userId, key);
      if (existing) { assertSameRequest(existing.hash, vHash); return { id: existing.id, duplicate: true }; }
    }
    throw e;
  }
}

/** Only name/description are editable; currency, type and acquisition data are historical facts. */
export async function updateAsset(ex: Executor, userId: string, assetId: string, raw: z.input<typeof assetEditSchema>) {
  const i = assetEditSchema.parse(raw);
  if (!idSchema.safeParse(assetId).success) throw notFound("Bien");
  await ex.transaction(async (q) => {
    const b = await q(`select name, description from assets where id = $1 and user_id = $2 for update`, [assetId, userId]);
    if (!b.rows[0]) throw notFound("Bien");
    await q(`update assets set name = $3, description = $4 where id = $1 and user_id = $2`, [assetId, userId, i.name, i.description ?? null]);
    await audit(q, userId, "asset.update", "asset", assetId,
      { name: b.rows[0].name, description: b.rows[0].description }, { name: i.name, description: i.description ?? null });
  });
}

/** "Baja" = archive: status disposed + disposed_on. The asset and all its valuations stay; it just leaves net worth from that date. */
export async function disposeAsset(ex: Executor, userId: string, assetId: string, raw: z.input<typeof assetDisposeSchema>) {
  const i = assetDisposeSchema.parse(raw);
  if (!idSchema.safeParse(assetId).success) throw notFound("Bien");
  notFuture(i.disposedOn, "La fecha de baja");
  await ex.transaction(async (q) => {
    const a = await q(`select status::text as status, acquired_on::text as acquired_on from assets where id = $1 and user_id = $2 for update`, [assetId, userId]);
    if (!a.rows[0]) throw notFound("Bien");
    if (a.rows[0].status === "disposed") throw new DomainError("ALREADY_DISPOSED", "El bien ya fue dado de baja.");
    if (a.rows[0].acquired_on && i.disposedOn < (a.rows[0].acquired_on as string)) {
      throw new DomainError("BEFORE_ACQUISITION", "La baja no puede ser anterior a la fecha de adquisición.");
    }
    await q(`update assets set status = 'disposed', disposed_on = $3 where id = $1 and user_id = $2`, [assetId, userId, i.disposedOn]);
    await audit(q, userId, "asset.dispose", "asset", assetId, { status: "active" }, { status: "disposed", disposedOn: i.disposedOn, note: i.note ?? null });
  });
}

// ---- reads --------------------------------------------------------------------

export async function listAssets(ex: Executor, userId: string, raw: AssetFilters = {}): Promise<AssetRow[]> {
  const f = assetFiltersSchema.parse(raw);
  const params: unknown[] = [userId];
  const where = ["a.user_id = $1"];
  const p = (v: unknown) => (params.push(v), `$${params.length}`);
  if (f.type) where.push(`a.type::text = ${p(f.type)}`);
  if (f.status) where.push(`a.status::text = ${p(f.status)}`);
  if (f.currency) where.push(`a.currency::text = ${p(f.currency)}`);
  const r = await ex.query(`${SELECT} where ${where.join(" and ")} order by (a.status = 'disposed'), a.name, a.id`, params);
  return r.rows.map(map);
}

export interface AssetDetail { asset: AssetRow; valuations: ValuationRow[]; history: AuditEntry[] }

const mapValuation = (r: Row): ValuationRow => ({
  id: r.id as string, valueMinor: BigInt(r.value as string), valuedOn: r.valued_on as string,
  source: (r.source as string | null) ?? null, note: (r.note as string | null) ?? null, createdAt: r.created_at as string,
});

/** Valuation history, newest value date first (ties: most recently inserted first). The first row is the current value. */
async function valuationsOf(q: Query, userId: string, assetId: string, order: "asc" | "desc"): Promise<ValuationRow[]> {
  const r = await q(
    `select id, value_minor::text as value, valued_on::text as valued_on, source, note, created_at::text as created_at
     from asset_valuations where user_id = $1 and asset_id = $2 order by valued_on ${order}, seq ${order}`,
    [userId, assetId],
  );
  return r.rows.map(mapValuation);
}

export async function getAsset(ex: Executor, userId: string, id: string): Promise<AssetDetail> {
  if (!idSchema.safeParse(id).success) throw notFound("Bien");
  const r = await ex.query(`${SELECT} where a.user_id = $1 and a.id = $2`, [userId, id]);
  if (!r.rows[0]) throw notFound("Bien");
  const [valuations, h] = await Promise.all([
    valuationsOf(ex.query, userId, id, "desc"),
    ex.query(
      `select id::text as id, action, before, after, created_at::text as "createdAt" from audit_log
       where user_id = $1 and entity_type = 'asset' and entity_id = $2 order by id`,
      [userId, id],
    ),
  ]);
  return { asset: map(r.rows[0]), valuations, history: h.rows as unknown as AuditEntry[] };
}

/** Chart series: every valuation of one asset, oldest first. All points share the asset's currency. */
export async function valuationSeries(ex: Executor, userId: string, assetId: string): Promise<{ currency: Currency; points: ValuationRow[] }> {
  if (!idSchema.safeParse(assetId).success) throw notFound("Bien");
  const a = await ex.query(`select currency::text as currency from assets where id = $1 and user_id = $2`, [assetId, userId]);
  if (!a.rows[0]) throw notFound("Bien");
  return { currency: a.rows[0].currency as Currency, points: await valuationsOf(ex.query, userId, assetId, "asc") };
}

// ---- net worth ----------------------------------------------------------------

/**
 * One currency's figures, all in that currency's minor units. EXACTLY what each one includes:
 *  - accounts    : balance (opening + entries dated <= asOf) of ACTIVE accounts opened on/before asOf. Archived accounts are excluded.
 *  - assets      : latest valuation (max valued_on <= asOf, then seq) of each asset that is active at asOf.
 *                  Disposed assets (disposed_on <= asOf) are excluded; their valuation history is untouched.
 *  - grossAssets : accounts + assets (patrimonio bruto). Loans are NOT in it.
 *  - payables    : OBLIGACIONES = outstanding principal of payable loans started on/before asOf (principal - principal repaid
 *                  by entries dated <= asOf, reversals netted exactly as the loan_balances view does). Interest is not debt here.
 *  - receivables : POR COBRAR = same for receivable loans. Shown separately, never inside grossAssets.
 *  - net         : patrimonio neto = grossAssets - payables + receivables.
 */
export interface NetWorthLine {
  accounts: bigint; assets: bigint; grossAssets: bigint; payables: bigint; receivables: bigint; net: bigint;
}
export type NetWorthKey = keyof NetWorthLine;
const KEYS: NetWorthKey[] = ["grossAssets", "payables", "receivables", "net"];

export interface NetWorth {
  asOf: string;
  /** Per currency; DOP and USD are never added together. */
  byCurrency: Record<Currency, NetWorthLine>;
  /** Only when a base currency was requested. Each figure is converted ONLY via fx.consolidate() with recorded rates,
   *  or is the explicit "sin_tasa" marker. Never estimated. */
  consolidated?: { currency: Currency; figures: Record<(typeof KEYS)[number], Consolidated> };
}

const NO_LIMIT = "9999-12-31"; // "current": no date bound, so the result equals the account/loan/asset views

type Totals = Record<Currency, bigint>;
const totalsOf = (rows: Row[], col = "t"): Totals => {
  const t: TotalsByCurrency = emptyTotals();
  for (const r of rows) t[r.currency as Currency] += BigInt(r[col] as string);
  return t;
};

/** All queries are scoped by user_id. `to` is an inclusive date bound. */
async function netWorthAt(q: Query, userId: string, to: string): Promise<Record<Currency, NetWorthLine>> {
  const [acc, ast, loans] = await Promise.all([
    q(
      `select a.currency::text as currency,
              sum(a.opening_balance_minor + coalesce((select sum(e.amount_minor) from entries e where e.account_id = a.id and e.date <= $2), 0))::text as t
       from accounts a where a.user_id = $1 and a.opening_date <= $2 group by a.currency`, // archived accounts still count: archiving hides, it must not make money disappear
      [userId, to],
    ),
    q(
      `select c.currency, sum(c.value_minor)::text as t from (
         select distinct on (v.asset_id) a.currency::text as currency, v.value_minor
         from asset_valuations v join assets a on a.id = v.asset_id
         where v.user_id = $1 and a.user_id = $1 and v.valued_on <= $2 and (a.status = 'active' or a.disposed_on > $2)
         order by v.asset_id, v.valued_on desc, v.seq desc) c group by c.currency`,
      [userId, to],
    ),
    // Same effective-type logic as the loan_balances view, restricted to entries dated <= $2.
    q(
      `with eff as (
         select t.loan_id, e.amount_minor, coalesce(o.type, t.type) as eff_type
         from entries e join transactions t on t.id = e.transaction_id left join transactions o on o.id = t.reverses_id
         where t.user_id = $1 and t.loan_id is not null and e.kind = 'loan_principal' and e.date <= $2
       ), paid as (
         select loan_id, sum(case eff_type when 'loan_collection' then amount_minor when 'loan_repayment' then -amount_minor else 0 end) as p
         from eff group by loan_id
       )
       select l.direction::text as direction, l.currency::text as currency,
              sum(l.principal_minor - coalesce(p.p, 0))::text as t
       from loans l left join paid p on p.loan_id = l.id
       where l.user_id = $1 and l.start_date <= $2
         and l.cancelled_at is null -- a cancelled loan never counts at any date: its money reversal carries the original date, so the ledger says it never happened
       group by l.direction, l.currency`,
      [userId, to],
    ),
  ]);
  const accounts = totalsOf(acc.rows), assets = totalsOf(ast.rows);
  const payables = totalsOf(loans.rows.filter((r) => r.direction === "payable"));
  const receivables = totalsOf(loans.rows.filter((r) => r.direction === "receivable"));
  const out = {} as Record<Currency, NetWorthLine>;
  for (const c of CURRENCIES) {
    const grossAssets = accounts[c] + assets[c];
    out[c] = { accounts: accounts[c], assets: assets[c], grossAssets, payables: payables[c], receivables: receivables[c], net: grossAssets - payables[c] + receivables[c] };
  }
  return out;
}

export async function netWorth(ex: Executor, userId: string, opts: { asOf?: string; baseCurrency?: Currency } = {}): Promise<NetWorth> {
  const asOf = opts.asOf ?? todayDR();
  const byCurrency = await netWorthAt(ex.query, userId, opts.asOf ?? NO_LIMIT);
  const res: NetWorth = { asOf, byCurrency };
  if (opts.baseCurrency) {
    const figures = {} as Record<(typeof KEYS)[number], Consolidated>;
    for (const k of KEYS) {
      figures[k] = await consolidate(ex, userId, CURRENCIES.map((c) => ({ minor: byCurrency[c][k], currency: c, date: asOf })), opts.baseCurrency);
    }
    res.consolidated = { currency: opts.baseCurrency, figures };
  }
  return res;
}

const monthEnd = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).toISOString().slice(0, 10);

/**
 * Net worth at the end of each of the last `months` months (the current month ends today), per currency, computed from the
 * ledger: entries, valuations and loan principal movements dated <= that day. LIMITATION (stated in the UI): the population is
 * today's: all accounts (archived ones included), and assets/loans as recorded now.
 */
export async function netWorthEvolution(ex: Executor, userId: string, months = 12): Promise<{ date: string; byCurrency: Record<Currency, NetWorthLine> }[]> {
  const n = Math.min(Math.max(Math.trunc(months), 1), 60);
  const today = todayDR();
  const [y, m] = today.split("-").map(Number);
  const dates: string[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    const end = monthEnd(d.getUTCFullYear(), d.getUTCMonth());
    dates.push(end > today ? today : end);
  }
  return Promise.all(dates.map(async (date) => ({ date, byCurrency: await netWorthAt(ex.query, userId, date) })));
}
