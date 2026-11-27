import { marketHandler } from "@/lib/market-route";
import { searchSymbols } from "@/server/market/service";

export const dynamic = "force-dynamic";

/** GET /api/market/search?q=apple */
export function GET(request: Request) {
  return marketHandler(request, async (_u, _ex, sp) => ({ result: await searchSymbols(sp.get("q")) }));
}
