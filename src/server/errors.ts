/** Expected business-rule failures. `message` is user-facing Spanish. */
export class DomainError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) => new DomainError("NOT_FOUND", `${what} no encontrado(a).`);

export const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "23505";
/** Postgres integrity class (23xxx), includes the ledger triggers. */
export const isIntegrityError = (e: unknown) => String((e as { code?: string } | null)?.code ?? "").startsWith("23");
