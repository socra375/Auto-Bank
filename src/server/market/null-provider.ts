import { unavailableQuote } from "./status";
import type { Interval, MarketProvider } from "./types";

/** Used when no provider/key is configured: honest 'unavailable' for everything. A correct state, not an error. */
export class NullProvider implements MarketProvider {
  readonly id = "none";
  async quote(symbols: string[]) {
    return symbols.map((s) => unavailableQuote(s, this.id, "not_configured"));
  }
  async history(symbol: string, interval: Interval) {
    return { symbol, interval, status: "unavailable" as const, candles: [], provider: this.id, reason: "not_configured" as const, detail: null };
  }
  async search() {
    return { hits: [], reason: "not_configured" as const, detail: null };
  }
}
