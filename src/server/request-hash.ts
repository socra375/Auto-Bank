import { createHash } from "node:crypto";
import { DomainError } from "./errors";

/** Deterministic JSON (sorted keys, bigint-safe, undefined dropped). */
function canonical(v: unknown): string {
  if (typeof v === "bigint") return JSON.stringify(v.toString());
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** Hash of WHAT a keyed request asks for (the key itself excluded). `scope` pins the target (e.g. the loan or asset id). */
export function requestHash(scope: string, input: object): string {
  const rest = { ...(input as Record<string, unknown>) };
  delete rest.idempotencyKey;
  return createHash("sha256").update(canonical({ scope, rest })).digest("hex");
}

export const KEY_REUSED_MESSAGE = "Esta solicitud reutiliza una clave de envío con datos distintos. Recarga la página y vuelve a intentarlo.";

/** A stored NULL hash (legacy rows, Eddie confirmations) is treated as "same": nothing to compare. */
export function assertSameRequest(stored: unknown, hash: string): void {
  if (stored != null && stored !== hash) throw new DomainError("KEY_REUSED", KEY_REUSED_MESSAGE);
}
