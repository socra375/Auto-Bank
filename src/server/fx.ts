import type { z } from "zod";
import type { Currency } from "@/lib/money";
import { audit } from "./audit";
import type { Executor, Query } from "./executor";
import { rateSchema } from "./schemas";

export interface RateRow { id: string; base: Currency; quote: Currency; rate: string; date: string; source: string }

export const SIN_TASA_LABEL = "Sin tipo de cambio registrado";

/** Upsert by (base, quote, date); replacing a rate leaves an audit row with before/after. */
export async function saveRate(ex: Executor, userId: string, raw: z.input<typeof rateSchema>) {
  const i = rateSchema.parse(raw);
  return ex.transaction(async (q) => {
    const prev = await q(
      `select rate::text as rate from exchange_rates where user_id=$1 and base=$2 and quote=$3 and effective_date=$4`,
      [userId, i.base, i.quote, i.date],
    );
    const r = await q(
      `insert into exchange_rates (user_id, base, quote, rate, effective_date, source)
       values ($1,$2,$3,$4,$5,'manual')
       on conflict (user_id, base, quote, effective_date) do update set rate = excluded.rate, source = 'manual'
       returning id`,
      [userId, i.base, i.quote, i.rate, i.date],
    );
    const id = r.rows[0].id as string;
    await audit(q, userId, prev.rows[0] ? "fx.update" : "fx.create", "exchange_rate", id,
      prev.rows[0] ? { rate: prev.rows[0].rate } : null, i);
    return id;
  });
}

export async function listRates(ex: Executor, userId: string, limit = 200): Promise<RateRow[]> {
  const r = await ex.query(
    `select id, base::text as base, quote::text as quote, rate::text as rate, effective_date::text as date, source
     from exchange_rates where user_id = $1 order by effective_date desc, base, quote limit $2`,
    [userId, limit],
  );
  return r.rows as unknown as RateRow[];
}

/** Rate scaled by 1e6 as bigint; numeric(18,6) always renders 6 decimals. */
const scaled = (rate: string) => BigInt(rate.replace(".", ""));

/** Half away from zero, BigInt only. */
function roundDiv(n: bigint, d: bigint): bigint {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const q = (2n * a + d) / (2n * d);
  return neg ? -q : q;
}

/** Converts minor units using a recorded rate row (1 base = rate quote), in either direction. */
export function convertMinor(minor: bigint, from: Currency, rate: { base: Currency; rate: string }): bigint {
  const r = scaled(rate.rate);
  return from === rate.base ? roundDiv(minor * r, 1_000_000n) : roundDiv(minor * 1_000_000n, r);
}

/** Latest recorded rate with effective_date <= asOf for the pair (direct row preferred on equal dates). Never estimates. */
export async function getRate(q: Query, userId: string, a: Currency, b: Currency, asOf: string) {
  const r = await q(
    `select base::text as base, quote::text as quote, rate::text as rate, effective_date::text as date
     from exchange_rates
     where user_id = $1 and effective_date <= $4
       and ((base = $2 and quote = $3) or (base = $3 and quote = $2))
     order by effective_date desc, (base = $2) desc limit 1`,
    [userId, a, b, asOf],
  );
  return (r.rows[0] as { base: Currency; quote: Currency; rate: string; date: string } | undefined) ?? null;
}

export interface ConsolidationItem { minor: bigint; currency: Currency; date: string }
export type Consolidated =
  | { status: "ok"; currency: Currency; totalMinor: bigint; rates: { from: Currency; base: Currency; rate: string; date: string }[] }
  | { status: "sin_tasa"; currency: Currency; missing: { currency: Currency; date: string }[] };

/**
 * Converts every item to `target` with the rate recorded on or before ITS date.
 * If any needed rate is missing the whole result is the explicit "sin_tasa" marker: no partial or estimated totals.
 */
export async function consolidate(ex: Executor, userId: string, items: readonly ConsolidationItem[], target: Currency): Promise<Consolidated> {
  let total = 0n;
  const rates: Extract<Consolidated, { status: "ok" }>["rates"] = [];
  const missing: { currency: Currency; date: string }[] = [];
  const cache = new Map<string, Awaited<ReturnType<typeof getRate>>>();
  for (const it of items) {
    if (it.currency === target) { total += it.minor; continue; }
    const key = `${it.currency}|${it.date}`;
    if (!cache.has(key)) cache.set(key, await getRate(ex.query, userId, it.currency, target, it.date));
    const rate = cache.get(key)!;
    if (!rate) { missing.push({ currency: it.currency, date: it.date }); continue; }
    total += convertMinor(it.minor, it.currency, rate);
    if (!rates.some((x) => x.from === it.currency && x.date === rate.date && x.base === rate.base)) {
      rates.push({ from: it.currency, base: rate.base, rate: rate.rate, date: rate.date });
    }
  }
  return missing.length ? { status: "sin_tasa", currency: target, missing } : { status: "ok", currency: target, totalMinor: total, rates };
}
