import { marketHandler, parseScope } from "@/lib/market-route";
import { getQuotes } from "@/server/market/service";

export const dynamic = "force-dynamic";

/** GET /api/market/quotes?scope=category:stocks|favorites|watchlist:<id> */
export function GET(request: Request) {
  return marketHandler(request, async (userId, ex, sp) => ({ rows: await getQuotes(ex, userId, parseScope(sp.get("scope"))) }));
}
