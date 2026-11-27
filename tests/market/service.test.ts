import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Executor } from "../../src/server/executor";
import { liteExecutor, makeDb } from "../db/helpers";
import { unavailableQuote } from "../../src/server/market/status";
import {
  addWatchlistItem, COOLDOWN_MS, createWatchlist, deleteWatchlist, getHistory, getQuotes, listWatchlists, QUOTE_TTL_MS, quotesFor,
  removeWatchlistItem, renameWatchlist, resetMarketState, searchSymbols, STALE_MAX_MS, toggleFavorite,
} from "../../src/server/market/service";
import type { CandleSeries, MarketProvider, Quote, Reason } from "../../src/server/market/types";

let db: PGlite;
let ex: Executor;
beforeEach(async () => { db = await makeDb(); ex = liteExecutor(db); resetMarketState(); });

let clock = Date.parse("2026-11-27T15:00:00Z");
const now = () => clock;
beforeEach(() => { clock = Date.parse("2026-11-27T15:00:00Z"); });

const good = (symbol: string, over: Partial<Quote> = {}): Quote => ({
  symbol, status: "realtime", price: 10, change: 1, changePct: 10, open: null, high: null, low: null, volume: null, currency: "USD",
  providerTs: new Date(clock - 5_000).toISOString(), fetchedAt: null, provider: "fake", reason: null, detail: null, ...over,
});

class FakeProvider implements MarketProvider {
  readonly id = "fake";
  calls: string[][] = [];
  mode: "ok" | "429" | "throw" | Reason = "ok";
  ts?: string;
  async quote(symbols: string[]) {
    this.calls.push(symbols);
    if (this.mode === "throw") throw new Error("kaboom");
    if (this.mode === "429") return symbols.map((s) => unavailableQuote(s, this.id, "rate_limited"));
    if (this.mode !== "ok") return symbols.map((s) => unavailableQuote(s, this.id, this.mode as Reason, "refused"));
    return symbols.map((s) => good(s, this.ts ? { providerTs: this.ts } : {}));
  }
  async history(symbol: string, interval: never): Promise<CandleSeries> {
    this.calls.push([`h:${symbol}`]);
    return { symbol, interval, status: "ok", candles: [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5 }], provider: this.id, reason: null, detail: null };
  }
  async search(q: string) {
    this.calls.push([`s:${q}`]);
    return { hits: [{ symbol: "AAPL", name: "Apple", exchange: null, type: null }, { symbol: "bad symbol!", name: "x", exchange: null, type: null }], reason: null, detail: null };
  }
}
const mkdeps = (p: FakeProvider) => ({ provider: p, now });

describe("quote cache", () => {
  it("serves from cache within TTL (one provider call), refetches after", async () => {
    const p = new FakeProvider();
    await quotesFor(ex, ["AAPL", "MSFT"], mkdeps(p));
    await quotesFor(ex, ["AAPL", "MSFT"], mkdeps(p));
    expect(p.calls).toHaveLength(1);
    expect(p.calls[0]).toEqual(["AAPL", "MSFT"]); // batched
    clock += QUOTE_TTL_MS + 1;
    await quotesFor(ex, ["AAPL"], mkdeps(p));
    expect(p.calls).toHaveLength(2);
  });
  it("cache keeps the provider's timestamp (never re-stamped) and records fetched_at", async () => {
    const p = new FakeProvider();
    const first = (await quotesFor(ex, ["AAPL"], mkdeps(p))).get("AAPL")!;
    clock += 10_000;
    const second = (await quotesFor(ex, ["AAPL"], mkdeps(p))).get("AAPL")!;
    expect(second.providerTs).toBe(first.providerTs);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(p.calls).toHaveLength(1);
  });
  it("a 'realtime' claim with a provider timestamp older than 2 min is served as 'delayed'", async () => {
    const p = new FakeProvider();
    expect((await quotesFor(ex, ["AAPL"], mkdeps(p))).get("AAPL")!.status).toBe("realtime");
    p.ts = new Date(clock - 150_000).toISOString();
    clock += QUOTE_TTL_MS + 1;
    expect((await quotesFor(ex, ["AAPL"], mkdeps(p))).get("AAPL")!.status).toBe("delayed");
  });
  it("429: cooldown stops further provider calls; stale data is never realtime and marked stale", async () => {
    const p = new FakeProvider();
    await quotesFor(ex, ["AAPL"], mkdeps(p));
    p.mode = "429";
    clock += QUOTE_TTL_MS + 1;
    const q = (await quotesFor(ex, ["AAPL"], mkdeps(p))).get("AAPL")!;
    expect(q.status).toBe("delayed");
    expect(q.reason).toBe("stale");
    expect(q.price).toBe(10);
    expect(q.providerTs).not.toBeNull();
    const calls = p.calls.length;
    clock += 5_000;
    await quotesFor(ex, ["AAPL"], mkdeps(p));
    expect(p.calls).toHaveLength(calls); // cooling down
    clock += COOLDOWN_MS;
    p.mode = "ok";
    expect((await quotesFor(ex, ["AAPL"], mkdeps(p))).get("AAPL")!.reason).toBeNull();
  });
  it("429 without usable cache => unavailable (rate_limited); too-old stale is dropped", async () => {
    const p = new FakeProvider();
    p.mode = "429";
    const none = (await quotesFor(ex, ["MSFT"], mkdeps(p))).get("MSFT")!;
    expect([none.status, none.reason, none.price]).toEqual(["unavailable", "rate_limited", null]);
    resetMarketState();
    p.mode = "ok";
    await quotesFor(ex, ["AAPL"], mkdeps(p));
    p.mode = "429";
    clock += STALE_MAX_MS + 1;
    expect((await quotesFor(ex, ["AAPL"], mkdeps(p))).get("AAPL")!.status).toBe("unavailable");
  });
  it("provider throwing => unavailable, no numbers", async () => {
    const p = new FakeProvider();
    p.mode = "throw";
    const q = (await quotesFor(ex, ["AAPL"], mkdeps(p))).get("AAPL")!;
    expect([q.status, q.price]).toEqual(["unavailable", null]);
  });
  it("refusal is cached briefly and keeps the provider's reason", async () => {
    const p = new FakeProvider();
    p.mode = "plan_not_supported";
    await quotesFor(ex, ["XAU/USD"], mkdeps(p));
    const q = (await quotesFor(ex, ["XAU/USD"], mkdeps(p))).get("XAU/USD")!;
    expect([q.status, q.reason, q.detail]).toEqual(["unavailable", "plan_not_supported", "refused"]);
    expect(p.calls).toHaveLength(1);
  });
  it("provider answering for another symbol is not substituted", async () => {
    const p = new FakeProvider();
    p.quote = async () => [good("SPY")];
    const q = (await quotesFor(ex, ["SPX"], mkdeps(p))).get("SPX")!;
    expect([q.symbol, q.status, q.price]).toEqual(["SPX", "unavailable", null]);
  });
});

describe("getQuotes scopes", () => {
  it("category uses the catalogue; with no provider everything is unavailable and nothing is cached", async () => {
    const rows = await getQuotes(ex, "u1", { kind: "category", category: "commodities" }); // default provider = none (env unset)
    expect(rows.map((r) => r.name)).toEqual(["WTI Crude Oil", "Brent Crude Oil", "Gold", "Silver", "Natural Gas"]);
    expect(rows.every((r) => r.quote.status === "unavailable" && r.quote.reason === "not_configured")).toBe(true);
    expect((await db.query(`select 1 from market_quotes_cache`)).rows).toHaveLength(0);
  });
  it("favorites and watchlist scopes are per user", async () => {
    const p = new FakeProvider();
    await toggleFavorite(ex, "u1", "AAPL");
    expect((await getQuotes(ex, "u1", { kind: "favorites" }, mkdeps(p))).map((r) => [r.symbol, r.favorite])).toEqual([["AAPL", true]]);
    expect(await getQuotes(ex, "u2", { kind: "favorites" }, mkdeps(p))).toEqual([]);
    const { id } = await createWatchlist(ex, "u1", "Mi lista");
    await addWatchlistItem(ex, "u1", id, "msft");
    expect((await getQuotes(ex, "u1", { kind: "watchlist", id }, mkdeps(p))).map((r) => r.symbol)).toEqual(["MSFT"]);
    await expect(getQuotes(ex, "u2", { kind: "watchlist", id }, mkdeps(p))).rejects.toThrow(/no encontrad/i);
  });
});

describe("history and search", () => {
  it("validates symbol/interval/range, caches OK history, drops invalid search hits", async () => {
    const p = new FakeProvider();
    await expect(getHistory("bad sym", "1day", 100, mkdeps(p))).rejects.toThrow();
    await expect(getHistory("AAPL", "2min", 100, mkdeps(p))).rejects.toThrow();
    await expect(getHistory("AAPL", "1day", 7, mkdeps(p))).rejects.toThrow();
    expect((await getHistory("aapl", "1day", "100", mkdeps(p))).status).toBe("ok");
    await getHistory("AAPL", "1day", 100, mkdeps(p));
    expect(p.calls.filter((c) => c[0].startsWith("h:"))).toHaveLength(1);
    const r = await searchSymbols("  apple<>  ", mkdeps(p));
    expect(r.hits.map((h) => h.symbol)).toEqual(["AAPL"]);
    expect(p.calls.at(-1)).toEqual(["s:apple"]);
    expect((await searchSymbols("%%%", mkdeps(p))).hits).toEqual([]);
    expect(p.calls.filter((c) => c[0].startsWith("s:"))).toHaveLength(1); // empty query never reaches the provider
  });
});

describe("watchlists and favorites", () => {
  const count = async (t: string) => Number((await db.query<{ n: number }>(`select count(*)::int n from ${t}`)).rows[0].n);
  it("CRUD with unique names per user, audited", async () => {
    const { id } = await createWatchlist(ex, "u1", "  Tech ");
    await expect(createWatchlist(ex, "u1", "Tech")).rejects.toThrow(/mismo nombre|ese nombre/);
    await createWatchlist(ex, "u2", "Tech"); // another user may reuse the name
    await renameWatchlist(ex, "u1", id, "Tecnología");
    await addWatchlistItem(ex, "u1", id, "nvda");
    await addWatchlistItem(ex, "u1", id, "NVDA"); // idempotent
    expect((await listWatchlists(ex, "u1"))[0]).toMatchObject({ name: "Tecnología", symbols: ["NVDA"] });
    await removeWatchlistItem(ex, "u1", id, "NVDA");
    await deleteWatchlist(ex, "u1", id);
    expect(await listWatchlists(ex, "u1")).toEqual([]);
    expect((await db.query(`select action from audit_log where user_id='u1' order by id`)).rows.map((r) => (r as { action: string }).action)).toEqual([
      "watchlist.create", "watchlist.rename", "watchlist.item_add", "watchlist.item_remove", "watchlist.delete",
    ]);
  });
  it("user B cannot read or change user A's lists", async () => {
    const { id } = await createWatchlist(ex, "u1", "Privada");
    await addWatchlistItem(ex, "u1", id, "AAPL");
    expect(await listWatchlists(ex, "u2")).toEqual([]);
    await expect(renameWatchlist(ex, "u2", id, "x")).rejects.toThrow(/no encontrad/i);
    await expect(deleteWatchlist(ex, "u2", id)).rejects.toThrow(/no encontrad/i);
    await expect(addWatchlistItem(ex, "u2", id, "MSFT")).rejects.toThrow(/no encontrad/i);
    await expect(removeWatchlistItem(ex, "u2", id, "AAPL")).rejects.toThrow(/no encontrad/i);
    expect((await listWatchlists(ex, "u1"))[0].symbols).toEqual(["AAPL"]);
  });
  it("DB composite FK rejects an item whose user does not own the list", async () => {
    const { id } = await createWatchlist(ex, "u1", "L");
    await expect(db.query(`insert into watchlist_items (watchlist_id, user_id, symbol) values ($1,'u2','AAPL')`, [id])).rejects.toThrow();
  });
  it("symbols are validated before they reach the DB", async () => {
    const { id } = await createWatchlist(ex, "u1", "L");
    await expect(addWatchlistItem(ex, "u1", id, "AAPL; drop table x")).rejects.toThrow(/Símbolo inválido/);
    await expect(toggleFavorite(ex, "u1", "no good")).rejects.toThrow(/Símbolo inválido/);
    expect(await count("watchlist_items")).toBe(0);
  });
  it("favorites toggle on/off, isolated per user, audited", async () => {
    expect(await toggleFavorite(ex, "u1", "btc/usd")).toEqual({ favorite: true });
    expect(await toggleFavorite(ex, "u2", "BTC/USD")).toEqual({ favorite: true });
    expect(await toggleFavorite(ex, "u1", "BTC/USD")).toEqual({ favorite: false });
    expect(await count("favorites")).toBe(1);
    expect((await db.query(`select action from audit_log where user_id='u1' order by id`)).rows.map((r) => (r as { action: string }).action)).toEqual(["favorite.add", "favorite.remove"]);
  });
});
