import type { Query } from "./executor";

const json = (v: unknown) =>
  v === undefined || v === null ? null : JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

/** Writes one audit_log row. Always called with the SAME query handle as the write it describes. */
export async function audit(
  q: Query, userId: string, action: string, entityType: string, entityId: string | null,
  before: unknown, after: unknown, actor: "user" | "eddie" = "user",
) {
  await q(
    `insert into audit_log (user_id, actor, action, entity_type, entity_id, before, after)
     values ($1, $7, $2, $3, $4, $5::jsonb, $6::jsonb)`,
    [userId, action, entityType, entityId, json(before), json(after), actor],
  );
}
