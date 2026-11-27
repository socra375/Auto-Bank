import { createNeonAuth } from "@neon/auth/next/server";
import { getDb } from "@/db/client";
import { evaluateClaim, getOwnerId, type Query } from "./owner";

/** Names of required env vars that are missing/invalid (names only, never values). */
export function missingAuthEnv(): string[] {
  const m: string[] = [];
  if (!process.env.NEON_AUTH_BASE_URL) m.push("NEON_AUTH_BASE_URL");
  if ((process.env.NEON_AUTH_COOKIE_SECRET ?? "").length < 32) m.push("NEON_AUTH_COOKIE_SECRET");
  if (!process.env.DATABASE_URL) m.push("DATABASE_URL");
  if (!process.env.OWNER_EMAIL) m.push("OWNER_EMAIL");
  return m;
}

type Auth = ReturnType<typeof createNeonAuth>;
let _auth: Auth | undefined;

/** Lazy: env is read at request time so `next build` works without it. Call only after missingAuthEnv() is empty. */
export function getAuth(): Auth {
  return (_auth ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
    logLevel: "error",
  }));
}

export const dbQuery: Query = async (sql, params) => {
  const r = await getDb().$client.query(sql, params);
  return { rows: r.rows };
};

export const ownerExists = async () => (await getOwnerId(dbQuery)) !== null;
export const claim = (userId: string, email?: string | null, emailVerified?: boolean | null) =>
  evaluateClaim(dbQuery, userId, email, process.env.OWNER_EMAIL, emailVerified);
