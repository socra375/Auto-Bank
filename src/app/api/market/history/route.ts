import { marketHandler } from "@/lib/market-route";
import { getHistory } from "@/server/market/service";

export const dynamic = "force-dynamic";

/** GET /api/market/history?symbol=AAPL&interval=1day&range=250 */
export function GET(request: Request) {
  return marketHandler(request, async (_u, _ex, sp) => ({ series: await getHistory(sp.get("symbol"), sp.get("interval"), sp.get("range")) }));
}
