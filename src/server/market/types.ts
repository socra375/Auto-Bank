/** Market Watch domain types. Market data only: nothing here can trade or touch the ledger. */

export type QuoteStatus = "realtime" | "delayed" | "unavailable";
export const CATEGORIES = ["commodities", "indices", "stocks", "forex", "crypto"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Machine reasons; the UI maps each to Spanish text. `detail` is the provider's own (sanitised) message, if any. */
export type Reason =
  | "not_configured" | "rate_limited" | "symbol_not_found" | "plan_not_supported" | "auth"
  | "provider_error" | "invalid_response" | "stale";

export interface Quote {
  /** Provider symbol exactly as requested. Never substituted. */
  symbol: string;
  status: QuoteStatus;
  /** All numeric fields are null when status is 'unavailable'. */
  price: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  currency: string | null;
  /** The PROVIDER's timestamp (ISO). Never server time. */
  providerTs: string | null;
  /** When WE last fetched it from the provider (ISO). Shown as "última actualización". */
  fetchedAt: string | null;
  provider: string;
  reason: Reason | null;
  detail: string | null;
}

export interface Candle { t: number; o: number; h: number; l: number; c: number; v?: number } // t = unix seconds (UTC)
export const INTERVALS = ["15min", "1h", "1day", "1week"] as const;
export type Interval = (typeof INTERVALS)[number];
export const RANGES = [100, 250, 500] as const; // number of candles requested
export type Range = (typeof RANGES)[number];

export interface CandleSeries {
  symbol: string;
  interval: Interval;
  status: "ok" | "unavailable";
  candles: Candle[];
  provider: string;
  reason: Reason | null;
  detail: string | null;
}

export interface SearchHit { symbol: string; name: string; exchange: string | null; type: string | null }
export interface SearchResult { hits: SearchHit[]; reason: Reason | null; detail: string | null }

export interface MarketProvider {
  readonly id: string;
  /** One Quote per requested symbol, in order. Must not throw per symbol. */
  quote(symbols: string[]): Promise<Quote[]>;
  history(symbol: string, interval: Interval, range: Range): Promise<CandleSeries>;
  search(query: string): Promise<SearchResult>;
}
