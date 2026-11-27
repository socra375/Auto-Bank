import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { claimIfAllowed, evaluateClaim, claimOwner, getOwnerId, type Query } from "../../src/lib/auth/owner";
import { makeDb } from "./helpers";

let db: PGlite;
let q: Query;
beforeEach(async () => {
  db = await makeDb();
  q = (sql, params) => db.query(sql, params) as ReturnType<Query>;
});

describe("app_owner", () => {
  it("first user claims ownership", async () => {
    expect(await getOwnerId(q)).toBeNull();
    expect(await claimOwner(q, "user-a")).toBe(true);
    expect(await getOwnerId(q)).toBe("user-a");
  });
  it("second user cannot claim", async () => {
    await claimOwner(q, "user-a");
    expect(await claimOwner(q, "user-b")).toBe(false);
    expect(await getOwnerId(q)).toBe("user-a");
  });
  it("same user is idempotent", async () => {
    expect(await claimOwner(q, "user-a")).toBe(true);
    expect(await claimOwner(q, "user-a")).toBe(true);
  });
  it("concurrent claims yield exactly one owner", async () => {
    const r = await Promise.all(["a", "b", "c"].map((u) => claimOwner(q, u)));
    expect(r.filter(Boolean)).toHaveLength(1);
  });
  it("a stranger who signs up first cannot claim: only OWNER_EMAIL can", async () => {
    expect(await claimIfAllowed(q, "stranger", "evil@x.com", "me@x.com", true)).toBe(false);
    expect(await getOwnerId(q)).toBeNull();
    expect(await claimIfAllowed(q, "me", " ME@x.com ", "me@x.com", true)).toBe(true);
    expect(await claimIfAllowed(q, "stranger", "me@x.com", "me@x.com", true)).toBe(false);
  });
  it("fails closed when OWNER_EMAIL is unset", async () => {
    expect(await claimIfAllowed(q, "me", "me@x.com", undefined, true)).toBe(false);
    expect(await getOwnerId(q)).toBeNull();
  });
  it("matching email but NOT verified cannot claim (first claim)", async () => {
    for (const v of [false, null, undefined]) {
      expect(await claimIfAllowed(q, "me", "me@x.com", "me@x.com", v)).toBe(false);
    }
    expect(await evaluateClaim(q, "me", "me@x.com", "me@x.com", false)).toBe("unverified");
    expect(await getOwnerId(q)).toBeNull();
  });
  it("verified + matching email claims; verified but another email does not", async () => {
    expect(await evaluateClaim(q, "other", "other@x.com", "me@x.com", true)).toBe("denied");
    expect(await getOwnerId(q)).toBeNull();
    expect(await evaluateClaim(q, "me", "me@x.com", "me@x.com", true)).toBe("owner");
    expect(await getOwnerId(q)).toBe("me");
  });
  it("once an owner exists only the id matters (verification state is irrelevant)", async () => {
    await claimIfAllowed(q, "me", "me@x.com", "me@x.com", true);
    expect(await claimIfAllowed(q, "me", "me@x.com", "me@x.com", false)).toBe(true);
    expect(await claimIfAllowed(q, "other", "me@x.com", "me@x.com", true)).toBe(false);
  });
  it("owner keeps access if their email later changes", async () => {
    await claimIfAllowed(q, "me", "me@x.com", "me@x.com", true);
    expect(await claimIfAllowed(q, "me", "new@x.com", "me@x.com", true)).toBe(true);
  });
  it("the table can never hold more than one row", async () => {
    await claimOwner(q, "user-a");
    await expect(db.query("insert into app_owner (user_id) values ('user-b')")).rejects.toThrow(/app_owner_single_row|duplicate/);
    expect((await db.query("select count(*)::int n from app_owner")).rows[0]).toEqual({ n: 1 });
  });
});
