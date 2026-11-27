import { createHash } from "node:crypto";
import type { Query } from "./owner";

/** Fixed 15-minute windows. Failed sign-ins/sign-ups only; a success clears the (ip,email) and email counters. */
export const AUTH_LIMITS = { perIpEmail: 5, perIp: 20, perEmail: 30 } as const;
export const RATE_LIMIT_MESSAGE = "Demasiados intentos. Inténtalo más tarde.";

const BUCKET = `date_bin('15 minutes', now(), timestamptz '2000-01-01 00:00:00+00')`;
const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export interface AuthKey { key: string; max: number; resetOnSuccess: boolean }

/**
 * Keys for one attempt. ip+email (5) throttles guessing from one client; ip alone (20) throttles spraying many emails;
 * email alone (30, higher on purpose) caps rotating-IP guessing against one account. No IP => no ip keys, so visitors
 * with an unknown IP never share one bucket.
 */
export function authKeys(ip: string | null, email: string, scope = ""): AuthKey[] {
  const e = `${scope}${email.trim().toLowerCase()}`;
  const keys: AuthKey[] = [{ key: `e:${h(e)}`, max: AUTH_LIMITS.perEmail, resetOnSuccess: true }];
  if (ip) {
    keys.push({ key: `ie:${h(`${ip}|${e}`)}`, max: AUTH_LIMITS.perIpEmail, resetOnSuccess: true });
    keys.push({ key: `i:${h(`${scope}${ip}`)}`, max: AUTH_LIMITS.perIp, resetOnSuccess: false });
  }
  return keys;
}

/** First hop of x-forwarded-for (set by the platform proxy, e.g. Vercel). Null when absent or malformed. */
export function clientIp(xff: string | null | undefined): string | null {
  const first = xff?.split(",")[0]?.trim();
  return first && first.length <= 64 && /^[0-9a-fA-F:.]+$/.test(first) ? first : null;
}

export async function isBlocked(q: Query, keys: AuthKey[]): Promise<boolean> {
  for (const k of keys) {
    const r = await q(`select attempts from auth_attempts where key = $1 and window_start = ${BUCKET}`, [k.key]);
    if (Number(r.rows[0]?.attempts ?? 0) >= k.max) return true;
  }
  return false;
}

export async function recordFailure(q: Query, keys: AuthKey[]): Promise<void> {
  await q(`delete from auth_attempts where window_start < now() - interval '1 day'`, []);
  for (const k of keys) {
    await q(
      `insert into auth_attempts (key, window_start) values ($1, ${BUCKET})
       on conflict (key, window_start) do update set attempts = auth_attempts.attempts + 1`,
      [k.key],
    );
  }
}

export async function resetOnSuccess(q: Query, keys: AuthKey[]): Promise<void> {
  for (const k of keys) if (k.resetOnSuccess) await q(`delete from auth_attempts where key = $1`, [k.key]);
}
