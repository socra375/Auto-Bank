/** Single-owner gate. Pure SQL over an injected executor so PGlite tests exercise the real thing. */
export type Query = (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

export async function getOwnerId(q: Query): Promise<string | null> {
  const r = await q("select user_id from app_owner limit 1", []);
  return (r.rows[0]?.user_id as string | undefined) ?? null;
}

/**
 * Atomically claims ownership for `userId` if nobody has. Returns true only when
 * `userId` IS the owner afterwards (first claim, or idempotent re-claim).
 */
export async function claimOwner(q: Query, userId: string): Promise<boolean> {
  await q("insert into app_owner (user_id) values ($1) on conflict do nothing", [userId]);
  return (await getOwnerId(q)) === userId;
}

export type ClaimStatus = "owner" | "unverified" | "denied";

/**
 * Neon Auth sign-up is public, so being authenticated is not enough: only the configured
 * OWNER_EMAIL, with a VERIFIED email, may make the FIRST claim (otherwise anyone who knows the address
 * could register it before the real owner). Fails closed when OWNER_EMAIL is unset. Once an owner exists,
 * only that user id passes (an email change must not lock the owner out).
 * "unverified" = the address matches but is not verified yet (lets the UI say what to do).
 */
export async function evaluateClaim(
  q: Query, userId: string, email: string | null | undefined, allowedEmail: string | undefined, emailVerified: boolean | null | undefined,
): Promise<ClaimStatus> {
  const owner = await getOwnerId(q);
  if (owner) return owner === userId ? "owner" : "denied";
  const allowed = allowedEmail?.trim().toLowerCase();
  if (!allowed || email?.trim().toLowerCase() !== allowed) return "denied";
  if (emailVerified !== true) return "unverified";
  return (await claimOwner(q, userId)) ? "owner" : "denied";
}

export async function claimIfAllowed(
  q: Query, userId: string, email: string | null | undefined, allowedEmail: string | undefined, emailVerified: boolean | null | undefined,
): Promise<boolean> {
  return (await evaluateClaim(q, userId, email, allowedEmail, emailVerified)) === "owner";
}

export const UNVERIFIED_MESSAGE = "Verifica tu correo para activar la cuenta de propietario.";
