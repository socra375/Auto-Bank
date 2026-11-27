import { ZodError } from "zod";
import { requireOwner } from "@/lib/auth/guard";
import { getExecutor } from "@/server/db";
import { DomainError, isIntegrityError } from "@/server/errors";
import type { Executor } from "@/server/executor";

export type ActionState = { error?: string; ok?: string } | null;

/** FormData -> plain object, dropping blank fields so optional Zod fields stay `undefined`. */
export function fields(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && v.trim() !== "" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

function message(e: unknown): string {
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Datos inválidos.";
  if (e instanceof DomainError) return e.message;
  if (isIntegrityError(e)) return "La operación no cumple las reglas de integridad del libro y fue rechazada.";
  console.error("server action failed", e);
  return "Ocurrió un error inesperado. Inténtalo de nuevo.";
}

/**
 * Every server action goes through here: requireOwner() FIRST (redirects when not the owner),
 * then the work scoped to the returned user id. Failures become a Spanish message, never a stack trace.
 */
export async function guarded(run: (userId: string, ex: Executor) => Promise<string | void>): Promise<ActionState> {
  const userId = await requireOwner();
  try {
    return { ok: (await run(userId, getExecutor())) || "Guardado." };
  } catch (e) {
    return { error: message(e) };
  }
}
