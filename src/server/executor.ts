import type { Pool } from "pg";

/** Minimal query shape shared by `pg` and PGlite so the same service code runs on both. */
export type Row = Record<string, unknown>;
export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;

export interface Executor {
  query: Query;
  /** Runs `fn` in ONE database transaction: commit on success, rollback on any throw (incl. COMMIT-time trigger errors). */
  transaction<T>(fn: (q: Query) => Promise<T>): Promise<T>;
}

export function pgExecutor(pool: Pool): Executor {
  return {
    query: (sql, params) => pool.query(sql, params as unknown[]),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn((sql, params) => client.query(sql, params as unknown[]));
        await client.query("commit");
        return result;
      } catch (e) {
        try {
          await client.query("rollback");
        } catch {
          /* connection already aborted */
        }
        throw e;
      } finally {
        client.release();
      }
    },
  };
}
