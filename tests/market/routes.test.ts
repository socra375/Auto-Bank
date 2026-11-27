import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { liteExecutor, makeDb } from "../db/helpers";
import { createLimiter } from "../../src/server/market/rate-limit";

const guard = vi.hoisted(() => ({ requireOwner: vi.fn() }));
const dbMock = vi.hoisted(() => ({ ex: undefined as unknown }));
vi.mock("@/lib/auth/guard", () => guard);
vi.mock("@/server/db", () => ({ getExecutor: () => dbMock.ex }));

import { GET as quotes } from "../../src/app/api/market/quotes/route";
import { GET as history } from "../../src/app/api/market/history/route";
import { GET as search } from "../../src/app/api/market/search/route";
import { marketLimiter } from "../../src/lib/market-route";

let db: PGlite;
beforeEach(async () => {
  db = await makeDb();
  dbMock.ex = liteExecutor(db);
  guard.requireOwner.mockReset();
  guard.requireOwner.mockResolvedValue("owner_1");
});
const req = (path: string) => new Request(`http://localhost/api/market/${path}`);

describe("owner guard", () => {
  it("every handler calls requireOwner first; a rejected guard stops the request before any data", async () => {
    guard.requireOwner.mockRejectedValue(new Error("NEXT_REDIRECT"));
    for (const [h, p] of [[quotes, "quotes?scope=favorites"], [history, "history?symbol=AAPL&interval=1day&range=100"], [search, "search?q=a"]] as const) {
      await expect(h(req(p))).rejects.toThrow("NEXT_REDIRECT");
    }
    expect(guard.requireOwner).toHaveBeenCalledTimes(3);
  });
  it("owner gets JSON, no-store; with no provider configured everything is unavailable (200, not an error)", async () => {
    const r = await quotes(req("quotes?scope=category:indices"));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = (await r.json()) as { rows: { quote: { status: string; reason: string } }[] };
    expect(body.rows).toHaveLength(5);
    expect(body.rows.every((x) => x.quote.status === "unavailable" && x.quote.reason === "not_configured")).toBe(true);
    const h = (await (await history(req("history?symbol=AAPL&interval=1day&range=100"))).json()) as { series: { status: string } };
    expect(h.series.status).toBe("unavailable");
  });
  it("bad params => 400 with a Spanish message, no internals", async () => {
    for (const p of ["quotes?scope=nope", "quotes?scope=watchlist:not-a-uuid", "history?symbol=bad%20sym&interval=1day&range=100", "history?symbol=AAPL&interval=1&range=100"]) {
      const r = await (p.startsWith("quotes") ? quotes : history)(req(p));
      expect(r.status).toBe(400);
      expect(JSON.stringify(await r.json())).not.toMatch(/stack|at |zod/i);
    }
  });
  it("the API key is not in any response body", async () => {
    vi.stubEnv("MARKET_API_KEY", "sk_route_secret_999");
    const text = await (await quotes(req("quotes?scope=category:stocks"))).text();
    expect(text).not.toContain("sk_route_secret_999");
    vi.unstubAllEnvs();
  });
});

describe("rate limiting", () => {
  it("token bucket: burst, then refill over time", () => {
    let t = 0;
    const l = createLimiter(3, 1, () => t);
    expect([l.take("a"), l.take("a"), l.take("a"), l.take("a")]).toEqual([true, true, true, false]);
    expect(l.take("b")).toBe(true); // per key
    t += 2_000;
    expect([l.take("a"), l.take("a"), l.take("a")]).toEqual([true, true, false]);
  });
  it("route returns 429 per user once the bucket is empty, before touching the provider", async () => {
    guard.requireOwner.mockResolvedValue("hammer_user");
    let last = 200;
    for (let i = 0; i < 40 && last === 200; i++) last = (await search(req("search?q=a"))).status;
    expect(last).toBe(429);
    guard.requireOwner.mockResolvedValue("other_user");
    expect((await search(req("search?q=a"))).status).toBe(200);
    expect(marketLimiter.take("fresh")).toBe(true);
  });
});
