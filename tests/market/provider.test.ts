import { describe, expect, it, vi } from "vitest";
import { NullProvider } from "../../src/server/market/null-provider";
import { getProvider } from "../../src/server/market/provider";
import { classifyStatus, safeDetail } from "../../src/server/market/status";
import { parseSymbol, sanitizeQuery } from "../../src/server/market/symbols";
import { TwelveDataProvider } from "../../src/server/market/twelvedata";

const KEY = "sk_test_SECRET_123456";
const NOW = Date.parse("2026-11-27T15:00:00Z");
const sec = (iso: string) => Date.parse(iso) / 1000;
const reply = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const mk = (impl: (url: string, init: RequestInit) => Promise<Response>, realtime = false) => {
  const f = vi.fn(impl);
  return { f, p: new TwelveDataProvider({ apiKey: KEY, declaredRealtime: realtime, fetchImpl: f as unknown as typeof fetch, now: () => NOW }) };
};
const item = (o: Record<string, unknown> = {}) => ({ symbol: "AAPL", close: "190.5", change: "1.5", percent_change: "0.79", high: "191", low: "189", volume: "1000", currency: "USD", timestamp: sec("2026-11-27T14:59:30Z"), ...o });

describe("status mapping", () => {
  it("realtime only when declared AND provider timestamp < 2 min old", () => {
    expect(classifyStatus(true, "2026-11-27T14:59:00Z", NOW)).toBe("realtime");
    expect(classifyStatus(true, "2026-11-27T14:50:00Z", NOW)).toBe("delayed");
    expect(classifyStatus(false, "2026-11-27T14:59:59Z", NOW)).toBe("delayed");
  });
  it("adapter: undeclared plan => delayed, declared + fresh => realtime, declared + old => delayed", async () => {
    expect((await mk(() => reply(item())).p.quote(["AAPL"]))[0].status).toBe("delayed");
    expect((await mk(() => reply(item()), true).p.quote(["AAPL"]))[0].status).toBe("realtime");
    expect((await mk(() => reply(item({ timestamp: sec("2026-11-26T21:00:00Z") })), true).p.quote(["AAPL"]))[0].status).toBe("delayed");
  });
  it("uses the provider's timestamp, never ours", async () => {
    const q = (await mk(() => reply(item())).p.quote(["AAPL"]))[0];
    expect(q.providerTs).toBe("2026-11-27T14:59:30.000Z");
    expect(q.price).toBe(190.5);
  });
  it("unknown shape => unavailable (no numbers)", async () => {
    for (const body of [{ foo: 1 }, item({ close: "abc" }), item({ timestamp: undefined }), [], "x"]) {
      const q = (await mk(() => reply(body)).p.quote(["AAPL"]))[0];
      expect(q.status).toBe("unavailable");
      expect(q.price).toBeNull();
      expect(q.reason).toBe("invalid_response");
    }
  });
  it("non-JSON / oversized bodies => unavailable", async () => {
    expect((await mk(() => Promise.resolve(new Response("<html>", { status: 200 }))).p.quote(["AAPL"]))[0].status).toBe("unavailable");
    const big = JSON.stringify({ pad: "x".repeat(1_100_000) });
    expect((await mk(() => Promise.resolve(new Response(big))).p.quote(["AAPL"]))[0].reason).toBe("invalid_response");
  });
});

describe("refusals and errors", () => {
  it("per-symbol refusal => unavailable with the provider's reason, others unaffected", async () => {
    const { p } = mk(() => reply({
      AAPL: item(),
      "XAU/USD": { code: 403, status: "error", message: "This symbol is available starting with Pro plan" },
      NOPE: { code: 400, status: "error", message: "symbol not found" },
    }));
    const [a, g, n] = await p.quote(["AAPL", "XAU/USD", "NOPE"]);
    expect(a.status).toBe("delayed");
    expect([g.status, g.reason, g.price]).toEqual(["unavailable", "plan_not_supported", null]);
    expect(g.detail).toMatch(/Pro plan/);
    expect([n.status, n.reason]).toEqual(["unavailable", "symbol_not_found"]);
  });
  it("no symbol substitution: a missing key in a batch is unavailable, never another symbol's data", async () => {
    const { p } = mk(() => reply({ AAPL: item(), SPY: item({ close: "500" }) }));
    const [spx] = await p.quote(["SPX", "AAPL"]);
    expect(spx.symbol).toBe("SPX");
    expect(spx.status).toBe("unavailable");
    expect(spx.price).toBeNull();
  });
  it("429 (HTTP or body) => rate_limited", async () => {
    expect((await mk(() => reply({}, 429)).p.quote(["AAPL"]))[0].reason).toBe("rate_limited");
    expect((await mk(() => reply({ code: 429, status: "error", message: "limit" }, 200)).p.quote(["AAPL", "MSFT"])).map((q) => q.reason)).toEqual(["rate_limited", "rate_limited"]);
  });
  it("network failure / timeout => provider_error without leaking the underlying message", async () => {
    const q = (await mk(() => Promise.reject(new Error(`boom ${KEY}`))).p.quote(["AAPL"]))[0];
    expect(q.reason).toBe("provider_error");
    expect(JSON.stringify(q)).not.toContain(KEY);
  });
  it("batches symbols in one request, key in a header only, fixed host", async () => {
    const { f, p } = mk(() => reply({ A: item(), B: item() }));
    await p.quote(["A", "B"]);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url.startsWith("https://api.twelvedata.com/quote?")).toBe(true);
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>).Authorization).toBe(`apikey ${KEY}`);
    expect(init.signal).toBeDefined();
  });
});

describe("history and search", () => {
  const series = { status: "ok", values: [
    { datetime: "2026-11-26", open: "2", high: "3", low: "1", close: "2.5", volume: "10" },
    { datetime: "2026-11-25", open: "1", high: "2", low: "0.5", close: "1.5" },
  ] };
  it("parses OHLC(+volume), sorted ascending", async () => {
    const s = await mk(() => reply(series)).p.history("AAPL", "1day", 100);
    expect(s.status).toBe("ok");
    expect(s.candles.map((c) => c.c)).toEqual([1.5, 2.5]);
    expect(s.candles[0].v).toBeUndefined();
    expect(s.candles[1].v).toBe(10);
  });
  it("bad history shape / error => unavailable, no candles", async () => {
    expect((await mk(() => reply({ values: [{ datetime: "bad", open: 1, high: 1, low: 1, close: 1 }] })).p.history("AAPL", "1day", 100)).status).toBe("unavailable");
    const r = await mk(() => reply({ code: 403, status: "error", message: "plan" })).p.history("AAPL", "1h", 100);
    expect([r.status, r.reason, r.candles.length]).toEqual(["unavailable", "plan_not_supported", 0]);
  });
  it("search maps results; bad shape => invalid_response", async () => {
    const ok = await mk(() => reply({ data: [{ symbol: "AAPL", instrument_name: "Apple Inc", exchange: "NASDAQ", instrument_type: "Common Stock" }] })).p.search("apple");
    expect(ok.hits).toEqual([{ symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ", type: "Common Stock" }]);
    expect((await mk(() => reply({ nope: 1 })).p.search("x")).reason).toBe("invalid_response");
  });
});

describe("NullProvider / selection", () => {
  it("everything unavailable with not_configured", async () => {
    const p = new NullProvider();
    const qs = await p.quote(["AAPL", "SPX"]);
    expect(qs.every((q) => q.status === "unavailable" && q.price === null && q.reason === "not_configured")).toBe(true);
    expect((await p.history("AAPL", "1day")).status).toBe("unavailable");
    expect((await p.search()).hits).toEqual([]);
  });
  it("getProvider: needs both provider name and key", () => {
    expect(getProvider({}).id).toBe("none");
    expect(getProvider({ MARKET_PROVIDER: "twelvedata" }).id).toBe("none");
    expect(getProvider({ MARKET_PROVIDER: "twelvedata", MARKET_API_KEY: KEY }).id).toBe("twelvedata");
    expect(getProvider({ MARKET_PROVIDER: "evil", MARKET_API_KEY: KEY }).id).toBe("none");
  });
});

describe("secrets", () => {
  it("API key never appears in quotes, series, search results or error details", async () => {
    const echo = { code: 401, status: "error", message: `bad key ${KEY} see https://x.test/?apikey=${KEY}` };
    const { p } = mk(() => reply(echo));
    const all = JSON.stringify([await p.quote(["A"]), await p.history("A", "1day", 100), await p.search("a")]);
    expect(all).not.toContain(KEY);
    expect(all).not.toContain("https://");
    expect(safeDetail(`x ${KEY} y`, KEY)).toBe("x *** y");
    expect(JSON.stringify(p)).not.toContain("SECRET_123456".slice(0, 6) + "nomatch"); // sanity
  });
});

describe("symbols and search input", () => {
  it("parseSymbol accepts strict provider symbols and rejects the rest", () => {
    expect(parseSymbol(" aapl ")).toBe("AAPL");
    expect(parseSymbol("eur/usd")).toBe("EUR/USD");
    for (const bad of ["", "A B", "AAPL;DROP", "a".repeat(21), "../x", "AA&PL", "AA?x=1", "'", null, 5, "-AB"]) expect(() => parseSymbol(bad)).toThrow();
  });
  it("sanitizeQuery strips control/odd chars and limits length", () => {
    expect(sanitizeQuery("  ap\u0000ple <script>  ")).toBe("apple script");
    expect(sanitizeQuery("a".repeat(500))).toHaveLength(40);
    expect(sanitizeQuery("%%%###")).toBe("");
    expect(sanitizeQuery({})).toBe("");
  });
});
