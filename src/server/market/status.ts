import type { Quote, QuoteStatus, Reason } from "./types";

export const REALTIME_MAX_AGE_MS = 2 * 60_000;

/**
 * 'realtime' ONLY when the provider declares real-time data for this answer AND the provider's own timestamp is < 2 min old.
 * Anything else that carries a usable price is 'delayed'. Without a valid provider timestamp the quote cannot be classified
 * at all, so callers must treat it as 'unavailable' (never call this with a null timestamp).
 */
export function classifyStatus(declaredRealtime: boolean, providerTs: string, now: number): Exclude<QuoteStatus, "unavailable"> {
  const age = now - Date.parse(providerTs);
  return declaredRealtime && age >= -30_000 && age < REALTIME_MAX_AGE_MS ? "realtime" : "delayed";
}

export function unavailableQuote(symbol: string, provider: string, reason: Reason, detail: string | null = null): Quote {
  return {
    symbol, status: "unavailable", price: null, change: null, changePct: null, open: null, high: null, low: null,
    volume: null, currency: null, providerTs: null, fetchedAt: null, provider, reason, detail,
  };
}

/** Provider messages are shown to the owner: strip the key, control chars and anything URL-like; bound the length. */
export function safeDetail(message: unknown, secret?: string): string | null {
  if (typeof message !== "string") return null;
  let s = message;
  if (secret) s = s.split(secret).join("***");
  s = s
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/apikey\S*/gi, "apikey")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return s || null;
}
