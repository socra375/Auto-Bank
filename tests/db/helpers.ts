import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../db/migrations");

/** In-memory Postgres with every migration applied in filename order. */
export async function makeDb(): Promise<PGlite> {
  const db = new PGlite();
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), "utf8"));
  }
  return db;
}

let seq = 0;
export const uid = (p = "u") => `${p}_${++seq}`;

type Row = Record<string, unknown>;
const one = async (db: PGlite, sql: string, params: unknown[]) =>
  (await db.query<Row>(sql, params)).rows[0] as { id: string };

export async function makeAccount(
  db: PGlite,
  userId: string,
  o: { currency?: "DOP" | "USD"; opening?: number; name?: string; type?: string } = {},
) {
  const r = await one(
    db,
    `insert into accounts (user_id, name, type, currency, opening_balance_minor, opening_date)
     values ($1, $2, $3, $4, $5, '2026-01-01') returning id`,
    [userId, o.name ?? uid("acc"), o.type ?? "bank", o.currency ?? "DOP", o.opening ?? 0],
  );
  return r.id;
}

export async function makeCategory(db: PGlite, userId: string, kind: "income" | "expense") {
  return (await one(db, `insert into categories (user_id, name, kind) values ($1,$2,$3) returning id`, [userId, uid("cat"), kind])).id;
}

export interface Leg { account: string; currency?: "DOP" | "USD"; kind: string; amount: number }

/** Inserts header + legs in ONE transaction so the deferred leg check runs at commit. */
export async function post(
  db: PGlite,
  userId: string,
  h: {
    type: string; date?: string; category?: string; loan?: string; key?: string;
    reverses?: string; legs: Leg[]; legDate?: string;
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    const date = h.date ?? "2026-02-01";
    const t = await tx.query<{ id: string }>(
      `insert into transactions (user_id, type, date, description, category_id, loan_id, idempotency_key, reverses_id)
       values ($1,$2,$3,'test',$4,$5,$6,$7) returning id`,
      [userId, h.type, date, h.category ?? null, h.loan ?? null, h.key ?? null, h.reverses ?? null],
    );
    for (const l of h.legs) {
      const cur = l.currency ?? (await tx.query<{ currency: string }>(`select currency from accounts where id=$1`, [l.account])).rows[0]?.currency;
      await tx.query(
        `insert into entries (transaction_id, user_id, account_id, currency, kind, amount_minor, date)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [t.rows[0].id, userId, l.account, cur, l.kind, l.amount, h.legDate ?? date],
      );
    }
    return t.rows[0].id;
  });
}

export async function makeLoan(
  db: PGlite,
  userId: string,
  o: { direction: "receivable" | "payable"; principal: number; currency?: "DOP" | "USD"; due?: string },
) {
  return (
    await one(
      db,
      `insert into loans (user_id, direction, counterparty, principal_minor, currency, start_date, due_date)
       values ($1,$2,'Juan',$3,$4,'1999-01-01',$5) returning id`,
      [userId, o.direction, o.principal, o.currency ?? "DOP", o.due ?? null],
    )
  ).id;
}

export async function rejects(p: Promise<unknown>, re: RegExp) {
  await expect(p).rejects.toThrow(re);
}
import { expect } from "vitest";

/** Same Executor contract as production (`pg`), backed by PGlite. */
export function liteExecutor(db: PGlite): import("../../src/server/executor").Executor {
  return {
    query: (sql, params) => db.query(sql, params as unknown[]) as never,
    transaction: (fn) => db.transaction((tx) => fn((sql, params) => tx.query(sql, params as unknown[]) as never)),
  };
}
