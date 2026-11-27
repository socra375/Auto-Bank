import { DomainError } from "../errors";

/** Strict provider-symbol shape (also enforced by a CHECK in 0008). Uppercase only; no spaces, quotes, `&`, `?`, `:` etc. */
export const SYMBOL_RE = /^[A-Z0-9][A-Z0-9./-]{0,19}$/;

export function parseSymbol(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!SYMBOL_RE.test(s)) throw new DomainError("BAD_SYMBOL", "Símbolo inválido.");
  return s;
}

export const MAX_QUERY = 40;
/** Free-text search input -> safe short string ("" when nothing usable). Strips control chars and anything but letters, digits, space . / & - _ */
export function sanitizeQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ./&_-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY);
}
