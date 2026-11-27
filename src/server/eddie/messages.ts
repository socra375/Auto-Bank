import type { Executor } from "../executor";

export const MAX_MESSAGES = 50;
export type StoredPart = { type: "text"; text: string } | { type: "proposal"; proposalId: string };
export interface StoredMessage { id: string; role: "user" | "assistant"; parts: StoredPart[] }

/** Oldest first, at most the last 50 of this owner. */
export async function loadHistory(ex: Executor, userId: string): Promise<StoredMessage[]> {
  const r = await ex.query(
    `select id::text as id, role, content from eddie_messages where user_id = $1 order by id desc limit $2`, [userId, MAX_MESSAGES]);
  return r.rows.reverse().map((m) => ({ id: m.id as string, role: m.role as "user" | "assistant", parts: ((m.content as { parts?: StoredPart[] }).parts ?? []) }));
}

/** Appends one message and prunes everything older than the last 50 (same transaction). */
export async function appendMessage(ex: Executor, userId: string, role: "user" | "assistant", parts: StoredPart[]) {
  await ex.transaction(async (q) => {
    await q(`insert into eddie_messages (user_id, role, content) values ($1,$2,$3::jsonb)`, [userId, role, JSON.stringify({ parts })]);
    await q(
      `delete from eddie_messages where user_id = $1 and id not in (select id from eddie_messages where user_id = $1 order by id desc limit $2)`,
      [userId, MAX_MESSAGES]);
  });
}

export async function clearHistory(ex: Executor, userId: string) {
  await ex.query(`delete from eddie_messages where user_id = $1`, [userId]);
}
