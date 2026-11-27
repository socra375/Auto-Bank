import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { claimIfAllowed, claimOwner, getOwnerId, type Query } from "../../src/lib/auth/owner";
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
    expect(await claimIfAllowed(q, "stranger", "evil@x.com", "me@x.com")).toBe(false);
    expect(await getOwnerId(q)).toBeNull();
    expect(await claimIfAllowed(q, "me", " ME@x.com ", "me@x.com")).toBe(true);
    expect(await claimIfAllowed(q, "stranger", "me@x.com", "me@x.com")).toBe(false);
  });
  it("fails closed when OWNER_EMAIL is unset", async () => {
    expect(await claimIfAllowed(q, "me", "me@x.com", undefined)).toBe(false);
    expect(await getOwnerId(q)).toBeNull();
  });
  it("owner keeps access if their email later changes", async () => {
    await claimIfAllowed(q, "me", "me@x.com", "me@x.com");
    expect(await claimIfAllowed(q, "me", "new@x.com", "me@x.com")).toBe(true);
  });
  it("the table can never hold more than one row", async () => {
    await claimOwner(q, "user-a");
    await expect(db.query("insert into app_owner (user_id) values ('user-b')")).rejects.toThrow(/app_owner_single_row|duplicate/);
    expect((await db.query("select count(*)::int n from app_owner")).rows[0]).toEqual({ n: 1 });
  });
});
