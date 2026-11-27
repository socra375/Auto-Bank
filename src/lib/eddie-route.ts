import { createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/guard";
import { getExecutor } from "@/server/db";
import { audit } from "@/server/audit";
import { appendMessage, loadHistory, type StoredPart } from "@/server/eddie/messages";
import { SYSTEM_PROMPT } from "@/server/eddie/prompt";
import { getProposals } from "@/server/eddie/proposals";
import { buildTools } from "@/server/eddie/tools";
import { createLimiter } from "@/server/market/rate-limit";

/** Per-user token bucket: burst of 10 messages, then 1 every 20 s (~30 per 10 min). In memory, per server instance (not a global quota). */
export const eddieLimiter = createLimiter(10, 0.05);
export const MAX_BODY_BYTES = 4_096;
export const MAX_STEPS = 6;
const bodySchema = z.object({ message: z.string().trim().min(1).max(1_000) }).strict();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/** Names only, never values. */
export function eddieConfig(env: Record<string, string | undefined> = process.env) {
  const missing = ["AI_GATEWAY_API_KEY", "EDDIE_MODEL"].filter((k) => !env[k]?.trim());
  return { configured: missing.length === 0, missing };
}

export interface EddieDeps { model?: LanguageModel }

/** Proposal ids created in a finished assistant message (tool outputs are server-made; nothing the model wrote is trusted). */
function proposalIds(parts: readonly { type: string; state?: string; output?: unknown }[]): string[] {
  return parts
    .filter((p) => p.type.startsWith("tool-propose_") && p.state === "output-available")
    .map((p) => (p.output as { data?: { proposalId?: unknown } } | undefined)?.data?.proposalId)
    .filter((x): x is string => typeof x === "string");
}

/** requireOwner() FIRST, then rate limit, size cap, Zod; only then the model. */
export async function eddiePost(request: Request, deps: EddieDeps = {}): Promise<Response> {
  const userId = await requireOwner();
  if (!eddieLimiter.take(userId)) return json(429, { error: "Demasiados mensajes. Espera unos segundos." });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json(413, { error: "Mensaje demasiado largo." });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json(413, { error: "Mensaje demasiado largo." });
  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(raw));
  } catch {
    return json(400, { error: "Solicitud inválida." });
  }
  if (!parsed.success) return json(400, { error: "Escribe un mensaje de hasta 1,000 caracteres." });
  const cfg = eddieConfig();
  if (!deps.model && !cfg.configured) return json(503, { error: "not_configured", missing: cfg.missing });

  const ex = getExecutor();
  try {
    const history = await loadHistory(ex, userId);
    const messages: ModelMessage[] = [];
    for (const m of history) {
      // Only plain text is replayed to the model: old tool outputs (untrusted data) are never re-injected.
      const text = m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n").trim();
      if (text) messages.push({ role: m.role, content: text });
    }
    messages.push({ role: "user", content: parsed.data.message });
    await appendMessage(ex, userId, "user", [{ type: "text", text: parsed.data.message }]);
    await audit(ex.query, userId, "eddie.chat", "eddie_chat", null, null, { chars: parsed.data.message.length }, "eddie");

    const result = streamText({
      model: deps.model ?? process.env.EDDIE_MODEL!, // plain "provider/model" id => AI Gateway; the key is read from AI_GATEWAY_API_KEY server-side
      instructions: SYSTEM_PROMPT,
      messages,
      tools: buildTools(ex, userId),
      stopWhen: isStepCount(MAX_STEPS),
      maxOutputTokens: 1_000,
      timeout: { totalMs: 60_000 },
      abortSignal: request.signal,
    });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        onError: () => "Eddie no pudo responder ahora. Inténtalo de nuevo.", // never forward provider errors
        onEnd: async ({ responseMessage }) => {
          const parts: StoredPart[] = [];
          const text = responseMessage.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("").trim();
          if (text) parts.push({ type: "text", text });
          for (const id of proposalIds(responseMessage.parts as never)) parts.push({ type: "proposal", proposalId: id });
          if (parts.length) await appendMessage(ex, userId, "assistant", parts);
        },
      }),
    });
  } catch {
    console.error("eddie chat failed");
    return json(500, { error: "Eddie no pudo responder ahora. Inténtalo de nuevo." });
  }
}

/** Panel bootstrap: configuration state (names only), last 50 messages and the live state of the proposals they mention. */
export async function eddieGet(): Promise<Response> {
  const userId = await requireOwner();
  const cfg = eddieConfig();
  const ex = getExecutor();
  try {
    const messages = await loadHistory(ex, userId);
    const ids = messages.flatMap((m) => m.parts.flatMap((p) => (p.type === "proposal" ? [p.proposalId] : [])));
    return json(200, { ...cfg, messages, proposals: await getProposals(ex, userId, ids) });
  } catch {
    console.error("eddie history failed");
    return json(500, { error: "No se pudo cargar el historial." });
  }
}
