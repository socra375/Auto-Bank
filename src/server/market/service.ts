import { z } from "zod";
import { audit } from "../audit";
import { DomainError, isUniqueViolation, notFound } from "../errors";
import type { Executor, Query } from "../executor";
import { idSchema } from "../schemas";
import { catalogByCategory, catalogName } from "./catalog";
import { getProvider } from "./provider";
import { classifyStatus, REALTIME_MAX_AGE_MS, unavailableQuote } from "./status";
import { parseSymbol, sanitizeQuery, SYMBOL_RE } from "./symbols";
import { CATEGORIES, INTERVALS, RANGES, type Category, type CandleSeries, type MarketProvider, type Quote, type SearchResult } from "./types";

export const QUOTE_TTL_MS = 30_000;
export const STALE_MAX_MS = 10 * 60_000; // an older cached quote is never shown when the provider is failing
export const COOLDOWN_MS = 60_000; // after a 429, do not call the provider again for this long
const HISTORY_TTL_MS = 60_000;
export const MAX_WATCHLISTS = 20, MAX_ITEMS = 50, MAX_FAVORITES = 100;

export interface Deps { provider?: MarketProvider; now?: () => number }
const dep = (d?: Deps) => ({ provider: d?.provider ?? getProvider(), now: d?.now ?? Date.now });

// ---- provider-side state (per instance; keeps the free-tier quota safe) -------------------------------
const cooldownUntil = new Map<string, number>();
const historyCache = new Map<string, { at: number; series: CandleSeries }>();
export function resetMarketState() { cooldownUntil.clear(); historyCache.clear(); }
const coolingDown = (p: string, now: number) => (cooldownUntil.get(p) ?? 0) > now;

// ---- quotes -------------------------------------------------------------------------------------------
/** Serve-time guard: a cached 'realtime' quote whose provider timestamp has aged past 2 min is shown as 'delayed'. */
export function reclassify(q: Quote, now: number): Quote {
  if (q.status === "realtime" && (!q.providerTs || now - Date.parse(q.providerTs) >= REALTIME_MAX_AGE_MS)) {
    return { ...q, status: classifyStatus(false, q.providerTs ?? new Date(0).toISOString(), now) };
  }
  return q;
}

interface CacheRow { symbol: string; payload: Quote; fetched_at: Date | string }

export async function quotesFor(ex: Executor, symbols: string[], deps?: Deps): Promise<Map<string, Quote>> {
  const { provider, now } = dep(deps);
  const out = new Map<string, Quote>();
  const unique = [...new Set(symbols)];
  if (unique.length === 0) return out;
  const t = now();
  if (provider.id === "none") { // nothing to cache: honest 'unavailable' for everything
    for (const q of await safeQuote(provider, unique)) out.set(q.symbol, q);
    return out;
  }
  const cached = new Map<string, CacheRow>();
  const res = await ex.query(
    `select symbol, payload, fetched_at from market_quotes_cache where provider = $1 and symbol = any($2::text[])`,
    [provider.id, unique],
  );
  for (const r of res.rows as unknown as CacheRow[]) cached.set(r.symbol, r);
  const stamped = (r: CacheRow): Quote => ({ ...r.payload, fetchedAt: new Date(r.fetched_at).toISOString() });
  const age = (r: CacheRow) => t - new Date(r.fetched_at).getTime();

  const missing: string[] = [];
  for (const s of unique) {
    const r = cached.get(s);
    if (r && age(r) < QUOTE_TTL_MS) out.set(s, reclassify(stamped(r), t));
    else missing.push(s);
  }
  if (missing.length === 0) return out;

  const fetched = coolingDown(provider.id, t)
    ? missing.map((s) => unavailableQuote(s, provider.id, "rate_limited"))
    : await safeQuote(provider, missing);
  if (fetched.some((q) => q.reason === "rate_limited")) cooldownUntil.set(provider.id, t + COOLDOWN_MS);

  const nowIso = new Date(t).toISOString();
  for (const q of fetched) {
    const transient = q.reason === "rate_limited" || q.reason === "provider_error";
    const old = cached.get(q.symbol);
    if (transient) {
      // Provider failing: an old-but-recent cached quote may be shown, but NEVER as realtime and clearly marked stale.
      if (old && old.payload.status !== "unavailable" && age(old) < STALE_MAX_MS) {
        out.set(q.symbol, { ...reclassify({ ...stamped(old), status: "delayed" }, t), reason: "stale" });
      } else out.set(q.symbol, { ...q, fetchedAt: nowIso });
      continue;
    }
    const stored = { ...q, fetchedAt: null };
    await ex.query(
      `insert into market_quotes_cache (provider, symbol, payload, provider_ts, fetched_at, status)
       values ($1,$2,$3::jsonb,$4,$5,$6)
       on conflict (provider, symbol) do update
         set payload = excluded.payload, provider_ts = excluded.provider_ts, fetched_at = excluded.fetched_at, status = excluded.status`,
      [provider.id, q.symbol, JSON.stringify(stored), q.providerTs, nowIso, q.status],
    );
    out.set(q.symbol, { ...q, fetchedAt: nowIso });
  }
  for (const [s, q] of out) out.set(s, reclassify(q, t)); // defence in depth: never serve 'realtime' with an old provider timestamp
  return out;
}

/** The provider contract says "never throw", but anything unexpected still becomes 'unavailable'. Order and symbols are enforced here. */
async function safeQuote(provider: MarketProvider, symbols: string[]): Promise<Quote[]> {
  let got: Quote[] = [];
  try {
    got = await provider.quote(symbols);
  } catch {
    /* fall through: every symbol becomes unavailable */
  }
  const by = new Map(got.map((q) => [q.symbol, q]));
  return symbols.map((s) => by.get(s) ?? unavailableQuote(s, provider.id, "provider_error")); // exact symbol only, no substitution
}

export type Scope = { kind: "category"; category: Category } | { kind: "favorites" } | { kind: "watchlist"; id: string };
export interface MarketRow { symbol: string; name: string; favorite: boolean; quote: Quote }

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("category"), category: z.enum(CATEGORIES) }),
  z.object({ kind: z.literal("favorites") }),
  z.object({ kind: z.literal("watchlist"), id: idSchema }),
]);

export async function getQuotes(ex: Executor, userId: string, scopeIn: Scope, deps?: Deps): Promise<MarketRow[]> {
  const scope = scopeSchema.parse(scopeIn);
  let symbols: string[];
  if (scope.kind === "category") symbols = catalogByCategory(scope.category).map((i) => i.symbol);
  else if (scope.kind === "favorites") symbols = await favoriteSymbols(ex.query, userId);
  else {
    await ownedWatchlist(ex.query, userId, scope.id);
    symbols = (await ex.query(`select symbol from watchlist_items where watchlist_id = $1 and user_id = $2 order by created_at, symbol`, [scope.id, userId]))
      .rows.map((r) => String(r.symbol));
  }
  const [quotes, favs] = await Promise.all([quotesFor(ex, symbols, deps), favoriteSymbols(ex.query, userId)]);
  const favSet = new Set(favs);
  return symbols.map((s) => ({ symbol: s, name: catalogName(s) ?? s, favorite: favSet.has(s), quote: quotes.get(s)! }));
}

// ---- history / search ---------------------------------------------------------------------------------
export async function getHistory(symbolIn: unknown, intervalIn: unknown, rangeIn: unknown, deps?: Deps): Promise<CandleSeries> {
  const symbol = parseSymbol(symbolIn);
  const interval = INTERVALS.find((i) => i === intervalIn);
  const range = RANGES.find((r) => r === Number(rangeIn));
  if (!interval || !range) throw new DomainError("BAD_PARAMS", "Intervalo o rango inválido.");
  const { provider, now } = dep(deps);
  const t = now();
  const key = `${provider.id}|${symbol}|${interval}|${range}`;
  const hit = historyCache.get(key);
  if (hit && t - hit.at < HISTORY_TTL_MS) return hit.series;
  if (coolingDown(provider.id, t)) {
    return { symbol, interval, status: "unavailable", candles: [], provider: provider.id, reason: "rate_limited", detail: null };
  }
  let series: CandleSeries;
  try {
    series = await provider.history(symbol, interval, range);
  } catch {
    series = { symbol, interval, status: "unavailable", candles: [], provider: provider.id, reason: "provider_error", detail: null };
  }
  if (series.symbol !== symbol) series = { symbol, interval, status: "unavailable", candles: [], provider: provider.id, reason: "invalid_response", detail: null };
  if (series.reason === "rate_limited") cooldownUntil.set(provider.id, t + COOLDOWN_MS);
  if (series.status === "ok") {
    if (historyCache.size >= 200) historyCache.clear();
    historyCache.set(key, { at: t, series });
  }
  return series;
}

export async function searchSymbols(queryIn: unknown, deps?: Deps): Promise<SearchResult> {
  const q = sanitizeQuery(queryIn);
  if (q.length < 1) return { hits: [], reason: null, detail: null };
  const { provider, now } = dep(deps);
  if (coolingDown(provider.id, now())) return { hits: [], reason: "rate_limited", detail: null };
  let r: SearchResult;
  try {
    r = await provider.search(q);
  } catch {
    r = { hits: [], reason: "provider_error", detail: null };
  }
  if (r.reason === "rate_limited") cooldownUntil.set(provider.id, now() + COOLDOWN_MS);
  return { ...r, hits: r.hits.filter((h) => SYMBOL_RE.test(h.symbol)).slice(0, 20) };
}

// ---- favorites & watchlists (user-scoped, audited) ------------------------------------------------------
async function favoriteSymbols(q: Query, userId: string): Promise<string[]> {
  return (await q(`select symbol from favorites where user_id = $1 order by created_at, symbol`, [userId])).rows.map((r) => String(r.symbol));
}

export async function toggleFavorite(ex: Executor, userId: string, symbolIn: unknown): Promise<{ favorite: boolean }> {
  const symbol = parseSymbol(symbolIn);
  return ex.transaction(async (q) => {
    const del = await q(`delete from favorites where user_id = $1 and symbol = $2 returning symbol`, [userId, symbol]);
    if (del.rows.length) {
      await audit(q, userId, "favorite.remove", "favorite", null, { symbol }, null);
      return { favorite: false };
    }
    const n = Number((await q(`select count(*)::int n from favorites where user_id = $1`, [userId])).rows[0].n);
    if (n >= MAX_FAVORITES) throw new DomainError("LIMIT", `Máximo ${MAX_FAVORITES} favoritos.`);
    await q(`insert into favorites (user_id, symbol) values ($1, $2)`, [userId, symbol]);
    await audit(q, userId, "favorite.add", "favorite", null, null, { symbol });
    return { favorite: true };
  });
}

export interface WatchlistRow { id: string; name: string; symbols: string[] }

export async function listWatchlists(ex: Executor, userId: string): Promise<WatchlistRow[]> {
  const lists = (await ex.query(`select id, name from watchlists where user_id = $1 order by lower(name), id`, [userId])).rows;
  const items = (await ex.query(`select watchlist_id, symbol from watchlist_items where user_id = $1 order by created_at, symbol`, [userId])).rows;
  return lists.map((l) => ({
    id: String(l.id), name: String(l.name),
    symbols: items.filter((i) => i.watchlist_id === l.id).map((i) => String(i.symbol)),
  }));
}

const nameSchema = z.string({ error: "El nombre es obligatorio." }).trim().min(1, "El nombre es obligatorio.").max(60, "Máximo 60 caracteres.");
const dupName = (e: unknown) => { if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", "Ya tienes una lista con ese nombre."); throw e; };

async function ownedWatchlist(q: Query, userId: string, id: string) {
  const r = (await q(`select id, name from watchlists where id = $1 and user_id = $2`, [id, userId])).rows[0];
  if (!r) throw notFound("Lista");
  return r as { id: string; name: string };
}

export async function createWatchlist(ex: Executor, userId: string, nameIn: unknown): Promise<{ id: string }> {
  const name = nameSchema.parse(nameIn);
  return ex.transaction(async (q) => {
    const n = Number((await q(`select count(*)::int n from watchlists where user_id = $1`, [userId])).rows[0].n);
    if (n >= MAX_WATCHLISTS) throw new DomainError("LIMIT", `Máximo ${MAX_WATCHLISTS} listas.`);
    const r = await q(`insert into watchlists (user_id, name) values ($1, $2) returning id`, [userId, name]).catch(dupName);
    const id = String(r.rows[0].id);
    await audit(q, userId, "watchlist.create", "watchlist", id, null, { name });
    return { id };
  });
}

export async function renameWatchlist(ex: Executor, userId: string, idIn: unknown, nameIn: unknown): Promise<void> {
  const id = idSchema.parse(idIn), name = nameSchema.parse(nameIn);
  await ex.transaction(async (q) => {
    const before = await ownedWatchlist(q, userId, id);
    await q(`update watchlists set name = $3 where id = $1 and user_id = $2`, [id, userId, name]).catch(dupName);
    await audit(q, userId, "watchlist.rename", "watchlist", id, { name: before.name }, { name });
  });
}

export async function deleteWatchlist(ex: Executor, userId: string, idIn: unknown): Promise<void> {
  const id = idSchema.parse(idIn);
  await ex.transaction(async (q) => {
    const before = await ownedWatchlist(q, userId, id);
    const items = (await q(`select symbol from watchlist_items where watchlist_id = $1 and user_id = $2`, [id, userId])).rows.map((r) => r.symbol);
    await q(`delete from watchlists where id = $1 and user_id = $2`, [id, userId]);
    await audit(q, userId, "watchlist.delete", "watchlist", id, { name: before.name, symbols: items }, null);
  });
}

export async function addWatchlistItem(ex: Executor, userId: string, idIn: unknown, symbolIn: unknown): Promise<void> {
  const id = idSchema.parse(idIn), symbol = parseSymbol(symbolIn);
  await ex.transaction(async (q) => {
    await ownedWatchlist(q, userId, id);
    const n = Number((await q(`select count(*)::int n from watchlist_items where watchlist_id = $1 and user_id = $2`, [id, userId])).rows[0].n);
    const ins = await q(
      `insert into watchlist_items (watchlist_id, user_id, symbol) values ($1,$2,$3) on conflict do nothing returning symbol`, [id, userId, symbol],
    );
    if (!ins.rows.length) return; // already there
    if (n >= MAX_ITEMS) throw new DomainError("LIMIT", `Máximo ${MAX_ITEMS} símbolos por lista.`);
    await audit(q, userId, "watchlist.item_add", "watchlist", id, null, { symbol });
  });
}

export async function removeWatchlistItem(ex: Executor, userId: string, idIn: unknown, symbolIn: unknown): Promise<void> {
  const id = idSchema.parse(idIn), symbol = parseSymbol(symbolIn);
  await ex.transaction(async (q) => {
    await ownedWatchlist(q, userId, id);
    const del = await q(`delete from watchlist_items where watchlist_id = $1 and user_id = $2 and symbol = $3 returning symbol`, [id, userId, symbol]);
    if (del.rows.length) await audit(q, userId, "watchlist.item_remove", "watchlist", id, { symbol }, null);
  });
}
