import { NullProvider } from "./null-provider";
import { TwelveDataProvider } from "./twelvedata";
import type { MarketProvider } from "./types";

/** MARKET_PROVIDER = 'twelvedata' | 'none'. Missing key or unknown value => NullProvider (honest 'unavailable'). Server-only. */
export function getProvider(env: Record<string, string | undefined> = process.env): MarketProvider {
  const key = env.MARKET_API_KEY?.trim();
  if (env.MARKET_PROVIDER === "twelvedata" && key) {
    return new TwelveDataProvider({ apiKey: key, declaredRealtime: env.MARKET_REALTIME === "true" });
  }
  return new NullProvider();
}

/** What to tell the owner when nothing is configured (no secrets involved). */
export function isConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return env.MARKET_PROVIDER === "twelvedata" && !!env.MARKET_API_KEY?.trim();
}
