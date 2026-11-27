import { z } from "zod";
import { classifyStatus, safeDetail, unavailableQuote } from "./status";
import type { Candle, CandleSeries, Interval, MarketProvider, Quote, Range, Reason, SearchResult } from "./types";

/**
 * Twelve Data adapter. UNVERIFIED against the live API: written without network access/API key from knowledge of the public
 * docs (GET /quote, /time_series, /symbol_search; `Authorization: apikey <key>` header). Every response is Zod-validated;
 * an unknown shape becomes 'unavailable', never a guess. The key travels only in a header (never in a URL, log or error).
 */
const BASE_URL = "https://api.twelvedata.com"; // fixed: no user-controlled host
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 1_000_000;
const QUOTE_CHUNK = 30;

class ProviderFailure extends Error {
  constructor(readonly reason: Reason, readonly detail: string | null) { super(reason); }
}

const num = z.union([z.string(), z.number()]).transform((v) => (typeof v === "string" && v.trim() === "" ? NaN : Number(v))).refine(Number.isFinite);
const optNum = num.nullish().catch(undefined);
const errorBody = z.object({ status: z.literal("error"), code: z.number().optional(), message: z.string().optional() });

const quoteItem = z.object({
  close: num,
  timestamp: num.refine((n) => n > 0),
  currency: z.string().max(10).nullish().catch(undefined),
  open: optNum, high: optNum, low: optNum, volume: optNum, change: optNum, percent_change: optNum,
});
const seriesBody = z.object({
  values: z.array(z.object({ datetime: z.string(), open: num, high: num, low: num, close: num, volume: optNum })).max(5_000),
});
const searchBody = z.object({
  data: z.array(z.object({
    symbol: z.string(), instrument_name: z.string().nullish().catch(undefined),
    exchange: z.string().nullish().catch(undefined), instrument_type: z.string().nullish().catch(undefined),
  })).max(100),
});

export interface TwelveDataOptions {
  apiKey: string;
  /** Operator declares the plan serves real-time data (env MARKET_REALTIME=true). Still requires a < 2 min provider timestamp. */
  declaredRealtime?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class TwelveDataProvider implements MarketProvider {
  readonly id = "twelvedata";
  private readonly key: string;
  private readonly realtime: boolean;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;

  constructor(o: TwelveDataOptions) {
    this.key = o.apiKey;
    this.realtime = o.declaredRealtime ?? false;
    this.doFetch = o.fetchImpl ?? fetch;
    this.now = o.now ?? Date.now;
  }

  private fail(e: unknown): ProviderFailure {
    if (e instanceof ProviderFailure) return e;
    return new ProviderFailure("provider_error", null); // network/timeout/abort: never echo the underlying message
  }

  private mapError(code: number | undefined, message: string | undefined): ProviderFailure {
    const detail = safeDetail(message, this.key);
    let reason: Reason = "provider_error";
    if (code === 429) reason = "rate_limited";
    else if (code === 401) reason = "auth";
    else if (code === 403 || /\b(plan|upgrade|subscription)\b/i.test(message ?? "")) reason = "plan_not_supported";
    else if (code === 400 || code === 404) reason = "symbol_not_found";
    return new ProviderFailure(reason, reason === "rate_limited" ? null : detail);
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown> {
    const url = `${BASE_URL}${path}?${new URLSearchParams(params).toString()}`;
    let res: Response;
    try {
      res = await this.doFetch(url, {
        headers: { Authorization: `apikey ${this.key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
        cache: "no-store",
      });
    } catch (e) {
      throw this.fail(e);
    }
    if (res.status === 429) throw new ProviderFailure("rate_limited", null);
    const body = await readJson(res);
    if (body === undefined) throw new ProviderFailure("invalid_response", null);
    const err = errorBody.safeParse(body);
    if (err.success) throw this.mapError(err.data.code, err.data.message);
    if (!res.ok) throw this.mapError(res.status, undefined);
    return body;
  }

  async quote(symbols: string[]): Promise<Quote[]> {
    const out = new Map<string, Quote>();
    for (let i = 0; i < symbols.length; i += QUOTE_CHUNK) {
      const chunk = symbols.slice(i, i + QUOTE_CHUNK);
      let body: unknown;
      try {
        body = await this.get("/quote", { symbol: chunk.join(",") });
      } catch (e) {
        const f = this.fail(e);
        for (const s of chunk) out.set(s, unavailableQuote(s, this.id, f.reason, f.detail));
        continue;
      }
      for (const s of chunk) {
        // One symbol: flat object. Several: object keyed by the requested symbol. Missing key => unavailable, never another symbol.
        const item = chunk.length === 1 ? body : (isRecord(body) ? body[s] : undefined);
        out.set(s, this.parseQuote(s, item));
      }
    }
    return symbols.map((s) => out.get(s) ?? unavailableQuote(s, this.id, "invalid_response"));
  }

  private parseQuote(symbol: string, item: unknown): Quote {
    const err = errorBody.safeParse(item);
    if (err.success) {
      const f = this.mapError(err.data.code, err.data.message);
      return unavailableQuote(symbol, this.id, f.reason, f.detail);
    }
    const p = quoteItem.safeParse(item);
    if (!p.success) return unavailableQuote(symbol, this.id, "invalid_response");
    const d = p.data;
    const providerTs = new Date(d.timestamp * 1000).toISOString(); // provider's own clock, never ours
    if (Number.isNaN(Date.parse(providerTs))) return unavailableQuote(symbol, this.id, "invalid_response");
    return {
      symbol,
      status: classifyStatus(this.realtime, providerTs, this.now()),
      price: d.close, change: d.change ?? null, changePct: d.percent_change ?? null,
      open: d.open ?? null, high: d.high ?? null, low: d.low ?? null, volume: d.volume ?? null,
      currency: d.currency ?? null, providerTs, fetchedAt: null, provider: this.id, reason: null, detail: null,
    };
  }

  async history(symbol: string, interval: Interval, range: Range): Promise<CandleSeries> {
    const base = { symbol, interval, provider: this.id };
    try {
      const body = await this.get("/time_series", {
        symbol, interval, outputsize: String(range), order: "ASC", timezone: "UTC",
      });
      const p = seriesBody.safeParse(body);
      if (!p.success) return { ...base, status: "unavailable", candles: [], reason: "invalid_response", detail: null };
      const byT = new Map<number, Candle>();
      for (const v of p.data.values) {
        const t = parseDatetimeUtc(v.datetime);
        if (t === null) return { ...base, status: "unavailable", candles: [], reason: "invalid_response", detail: null };
        byT.set(t, { t, o: v.open, h: v.high, l: v.low, c: v.close, ...(v.volume != null ? { v: v.volume } : {}) });
      }
      const candles = [...byT.values()].sort((a, b) => a.t - b.t);
      if (candles.length === 0) return { ...base, status: "unavailable", candles: [], reason: "invalid_response", detail: null };
      return { ...base, status: "ok", candles, reason: null, detail: null };
    } catch (e) {
      const f = this.fail(e);
      return { ...base, status: "unavailable", candles: [], reason: f.reason, detail: f.detail };
    }
  }

  async search(query: string): Promise<SearchResult> {
    try {
      const body = await this.get("/symbol_search", { symbol: query, outputsize: "20" });
      const p = searchBody.safeParse(body);
      if (!p.success) return { hits: [], reason: "invalid_response", detail: null };
      return {
        hits: p.data.data.map((r) => ({
          symbol: r.symbol, name: (r.instrument_name ?? r.symbol).slice(0, 80), exchange: r.exchange ?? null, type: r.instrument_type ?? null,
        })),
        reason: null, detail: null,
      };
    } catch (e) {
      const f = this.fail(e);
      return { hits: [], reason: f.reason, detail: f.detail };
    }
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** "2026-11-26" or "2026-11-26 15:30:00" (requested with timezone=UTC) -> unix seconds, or null if malformed. */
export function parseDatetimeUtc(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return Number.isFinite(t) ? t / 1000 : null;
}

/** Reads at most MAX_BYTES (stream-bounded, not trusting Content-Length) and parses JSON; undefined when oversized/invalid. */
async function readJson(res: Response): Promise<unknown> {
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > MAX_BYTES) return undefined;
  if (!res.body) return undefined;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); return undefined; }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    return undefined;
  }
}
