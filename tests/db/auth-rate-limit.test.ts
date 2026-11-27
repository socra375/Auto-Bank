import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import type { Query } from "../../src/lib/auth/owner";
import { authKeys, clientIp, isBlocked, recordFailure, resetOnSuccess } from "../../src/lib/auth/rate-limit";
import { makeDb } from "./helpers";

let db: PGlite;
let q: Query;
beforeEach(async () => {
  db = await makeDb();
  q = (sql, params) => db.query(sql, params) as ReturnType<Query>;
});
const fail = async (ip: string | null, email: string, n: number) => { for (let i = 0; i < n; i++) await recordFailure(q, authKeys(ip, email)); };

describe("auth throttle", () => {
  it("blocks the 6th attempt of the same ip+email, not the 5th", async () => {
    await fail("1.1.1.1", "a@x.com", 4);
    expect(await isBlocked(q, authKeys("1.1.1.1", "a@x.com"))).toBe(false);
    await fail("1.1.1.1", "a@x.com", 1);
    expect(await isBlocked(q, authKeys("1.1.1.1", "a@x.com"))).toBe(true);
  });
  it("email is case/space-insensitive; a different IP + different email is NOT blocked (no shared bucket)", async () => {
    await fail("1.1.1.1", "a@x.com", 5);
    expect(await isBlocked(q, authKeys("1.1.1.1", " A@X.com "))).toBe(true);
    expect(await isBlocked(q, authKeys("2.2.2.2", "b@x.com"))).toBe(false);
  });
  it("one IP spraying many emails hits the per-IP cap (20)", async () => {
    for (let i = 0; i < 20; i++) await recordFailure(q, authKeys("3.3.3.3", `u${i}@x.com`));
    expect(await isBlocked(q, authKeys("3.3.3.3", "fresh@x.com"))).toBe(true);
    expect(await isBlocked(q, authKeys("4.4.4.4", "fresh@x.com"))).toBe(false);
  });
  it("rotating IPs against one email hit the per-email cap (30)", async () => {
    for (let i = 0; i < 30; i++) await recordFailure(q, authKeys(`9.9.9.${i}`, "victim@x.com"));
    expect(await isBlocked(q, authKeys("8.8.8.8", "victim@x.com"))).toBe(true);
  });
  it("a successful login resets the ip+email and email counters but not the ip counter", async () => {
    await fail("1.1.1.1", "a@x.com", 5);
    await resetOnSuccess(q, authKeys("1.1.1.1", "a@x.com"));
    expect(await isBlocked(q, authKeys("1.1.1.1", "a@x.com"))).toBe(false);
    const ip = await db.query("select attempts from auth_attempts where key like 'i:%'");
    expect(ip.rows[0]).toEqual({ attempts: 5 });
  });
  it("unknown IP: only email keys apply, so nobody shares an 'unknown' bucket", async () => {
    expect(authKeys(null, "a@x.com")).toHaveLength(1);
    await fail(null, "a@x.com", 5);
    expect(await isBlocked(q, authKeys(null, "other@x.com"))).toBe(false);
  });
  it("stores only hashes, and cleanup drops rows older than a day", async () => {
    await fail("1.1.1.1", "a@x.com", 1);
    const keys = (await db.query<{ key: string }>("select key from auth_attempts")).rows.map((r) => r.key).join(" ");
    expect(keys).not.toMatch(/1\.1\.1\.1|a@x\.com/);
    await db.query("insert into auth_attempts (key, window_start) values ('old', now() - interval '2 days')");
    await fail("1.1.1.1", "a@x.com", 1);
    expect((await db.query("select 1 from auth_attempts where key = 'old'")).rows).toHaveLength(0);
  });
  it("clientIp takes the first hop and rejects junk", () => {
    expect(clientIp("203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
    expect(clientIp("2001:db8::1")).toBe("2001:db8::1");
    expect(clientIp("<script>")).toBeNull();
    expect(clientIp(null)).toBeNull();
  });
});
