/** In-memory token bucket per key (per user). Per serverless instance: a guard against accidental hammering, not a quota system. */
export interface Bucket { tokens: number; at: number }

export function createLimiter(capacity: number, refillPerSec: number, now: () => number = Date.now) {
  const buckets = new Map<string, Bucket>();
  return {
    take(key: string): boolean {
      const t = now();
      const b = buckets.get(key) ?? { tokens: capacity, at: t };
      b.tokens = Math.min(capacity, b.tokens + ((t - b.at) / 1000) * refillPerSec);
      b.at = t;
      const ok = b.tokens >= 1;
      if (ok) b.tokens -= 1;
      buckets.set(key, b);
      if (buckets.size > 1_000) for (const [k, v] of buckets) if (t - v.at > 600_000) buckets.delete(k);
      return ok;
    },
  };
}
