import { requireOwner } from "@/lib/auth/guard";
import { getExecutor } from "@/server/db";
import type { Executor } from "@/server/executor";
import { DomainError } from "@/server/errors";
import { createLimiter } from "@/server/market/rate-limit";
import { CATEGORIES, type Category } from "@/server/market/types";
import type { Scope } from "@/server/market/service";
import { ZodError } from "zod";

/** Per-user token bucket shared by all market route handlers: 20 requests burst, then 1 every 2 s. Per instance, in memory. */
export const marketLimiter = createLimiter(20, 0.5);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/** requireOwner() FIRST (redirects when not the owner), then the per-user rate limit, then the work. Errors never leak details. */
export async function marketHandler(
  request: Request,
  run: (userId: string, ex: Executor, params: URLSearchParams) => Promise<unknown>,
): Promise<Response> {
  const userId = await requireOwner();
  if (!marketLimiter.take(userId)) return json(429, { error: "Demasiadas solicitudes. Espera unos segundos." });
  try {
    return json(200, await run(userId, getExecutor(), new URL(request.url).searchParams));
  } catch (e) {
    if (e instanceof DomainError) return json(e.code === "NOT_FOUND" ? 404 : 400, { error: e.message });
    if (e instanceof ZodError) return json(400, { error: "Parámetros inválidos." });
    console.error("market route failed", e instanceof Error ? e.name : "error");
    return json(500, { error: "No se pudo obtener los datos de mercado." });
  }
}

/** "category:stocks" | "favorites" | "watchlist:<uuid>" (the uuid is validated by the service). */
export function parseScope(raw: string | null): Scope {
  if (raw === "favorites") return { kind: "favorites" };
  if (raw?.startsWith("watchlist:")) return { kind: "watchlist", id: raw.slice(10) };
  if (raw?.startsWith("category:") && (CATEGORIES as readonly string[]).includes(raw.slice(9))) {
    return { kind: "category", category: raw.slice(9) as Category };
  }
  throw new DomainError("BAD_PARAMS", "Ámbito inválido.");
}
