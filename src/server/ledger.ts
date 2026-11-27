import type { Currency } from "@/lib/money";
import { audit } from "./audit";
import { getAccount, type AccountWithBalance } from "./accounts";
import { getCategory } from "./categories";
import { DomainError, isUniqueViolation, notFound } from "./errors";
import type { Executor, Query, Row } from "./executor";
import {
  idSchema, movementFiltersSchema, movementMetaSchema, movementSchema,
  type MovementFilters, type MovementInput,
} from "./schemas";
import type { z } from "zod";

export type EntryKind = "income" | "expense" | "transfer" | "adjustment" | "loan_principal" | "loan_interest";
export interface Leg { accountId: string; currency: Currency; kind: EntryKind; amountMinor: bigint }
export interface NewTransaction {
  type: "income" | "expense" | "transfer" | "adjustment" | "loan_disbursement" | "loan_proceeds" | "loan_collection" | "loan_repayment";
  date: string; description: string; notes?: string; categoryId?: string; loanId?: string; fxRate?: string;
  idempotencyKey?: string; legs: Leg[];
  /** Who originated it (created_by + audit actor). Default 'user'. */
  actor?: "user" | "eddie";
}


// ---- low-level posting (also the base for loans in stage 5) -----------------

/**
 * Inserts header + legs + audit row using the caller's transaction handle. The deferred DB trigger
 * validates the leg shape at COMMIT, so a bad shape fails the whole surrounding transaction.
 */
export async function postTransaction(q: Query, userId: string, t: NewTransaction): Promise<string> {
  const h = await q(
    `insert into transactions (user_id, type, date, description, notes, category_id, loan_id, fx_rate, idempotency_key, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [userId, t.type, t.date, t.description, t.notes ?? null, t.categoryId ?? null, t.loanId ?? null, t.fxRate ?? null, t.idempotencyKey ?? null, t.actor ?? "user"],
  );
  const id = h.rows[0].id as string;
  for (const l of t.legs) {
    await q(
      `insert into entries (transaction_id, user_id, account_id, currency, kind, amount_minor, date)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, userId, l.accountId, l.currency, l.kind, l.amountMinor.toString(), t.date],
    );
  }
  await audit(q, userId, "txn.create", "transaction", id, null, {
    type: t.type, date: t.date, description: t.description, notes: t.notes ?? null, categoryId: t.categoryId ?? null, loanId: t.loanId ?? null,
    fxRate: t.fxRate ?? null, legs: t.legs,
  }, t.actor ?? "user");
  return id;
}

async function activeAccount(q: Query, userId: string, id: string): Promise<AccountWithBalance> {
  const a = await getAccount(q, userId, id);
  if (a.status === "archived") throw new DomainError("ACCOUNT_ARCHIVED", `La cuenta "${a.name}" está archivada y no admite movimientos.`);
  return a;
}

async function categoryOfKind(q: Query, userId: string, id: string, kind: "income" | "expense") {
  const c = await getCategory(q, userId, id);
  if (c.kind !== kind) throw new DomainError("CATEGORY_KIND", "La categoría no corresponde al tipo de movimiento.");
  if (c.status === "archived") throw new DomainError("CATEGORY_ARCHIVED", `La categoría "${c.name}" está archivada.`);
}

/** Validates ownership/state and converts the typed input into signed legs. */
async function buildTransaction(q: Query, userId: string, i: z.output<typeof movementSchema>): Promise<NewTransaction> {
  const head = { date: i.date, description: i.description, notes: i.notes, idempotencyKey: i.idempotencyKey };
  switch (i.type) {
    case "income":
    case "expense": {
      const a = await activeAccount(q, userId, i.accountId);
      await categoryOfKind(q, userId, i.categoryId, i.type);
      const sign = i.type === "income" ? 1n : -1n;
      return { ...head, type: i.type, categoryId: i.categoryId,
        legs: [{ accountId: a.id, currency: a.currency, kind: i.type, amountMinor: sign * i.amount }] };
    }
    case "adjustment": {
      const a = await activeAccount(q, userId, i.accountId);
      const sign = i.direction === "increase" ? 1n : -1n;
      return { ...head, type: "adjustment", legs: [{ accountId: a.id, currency: a.currency, kind: "adjustment", amountMinor: sign * i.amount }] };
    }
    case "transfer": {
      if (i.fromAccountId === i.toAccountId) throw new DomainError("SAME_ACCOUNT", "Origen y destino deben ser cuentas distintas.");
      const from = await activeAccount(q, userId, i.fromAccountId);
      const to = await activeAccount(q, userId, i.toAccountId);
      let amountIn = i.amount;
      let fxRate: string | undefined;
      if (from.currency === to.currency) {
        if (i.amountIn !== undefined && i.amountIn !== i.amount) {
          throw new DomainError("AMOUNT_MISMATCH", "En una transferencia en la misma moneda el monto recibido debe ser igual al enviado.");
        }
      } else {
        if (i.amountIn === undefined || i.fxRate === undefined) {
          throw new DomainError("FX_REQUIRED", "Una transferencia entre monedas requiere la tasa de cambio y el monto recibido.");
        }
        amountIn = i.amountIn;
        fxRate = i.fxRate;
      }
      return { ...head, type: "transfer", fxRate, legs: [
        { accountId: from.id, currency: from.currency, kind: "transfer", amountMinor: -i.amount },
        { accountId: to.id, currency: to.currency, kind: "transfer", amountMinor: amountIn },
      ] };
    }
  }
}

/** Validates a movement (ownership, active accounts, category kind, currency/FX rules) WITHOUT writing; returns the legs it would post. */
export async function validateMovement(q: Query, userId: string, raw: MovementInput): Promise<NewTransaction> {
  return buildTransaction(q, userId, movementSchema.parse(raw));
}

async function idForKey(q: Query, userId: string, key: string) {
  const r = await q(`select id from transactions where user_id = $1 and idempotency_key = $2`, [userId, key]);
  return (r.rows[0]?.id as string | undefined) ?? null;
}

/** Creates income / expense / transfer / adjustment in ONE DB transaction. A repeated idempotencyKey returns the first result. */
export async function createMovement(ex: Executor, userId: string, raw: MovementInput): Promise<{ id: string; duplicate: boolean }> {
  const input = movementSchema.parse(raw);
  const key = input.idempotencyKey;
  try {
    return await ex.transaction(async (q) => {
      if (key) {
        const existing = await idForKey(q, userId, key);
        if (existing) return { id: existing, duplicate: true };
      }
      const id = await postTransaction(q, userId, await buildTransaction(q, userId, input));
      return { id, duplicate: false };
    });
  } catch (e) {
    if (key && isUniqueViolation(e)) {
      const existing = await idForKey(ex.query, userId, key); // lost a race with the same key
      if (existing) return { id: existing, duplicate: true };
    }
    throw e;
  }
}

type Typed<T extends string> = Omit<Extract<MovementInput, { type: T }>, "type">;
export const createIncome = (ex: Executor, u: string, i: Typed<"income">) => createMovement(ex, u, { ...i, type: "income" });
export const createExpense = (ex: Executor, u: string, i: Typed<"expense">) => createMovement(ex, u, { ...i, type: "expense" });
export const createTransfer = (ex: Executor, u: string, i: Typed<"transfer">) => createMovement(ex, u, { ...i, type: "transfer" });
export const createAdjustment = (ex: Executor, u: string, i: Typed<"adjustment">) => createMovement(ex, u, { ...i, type: "adjustment" });

// ---- corrections ------------------------------------------------------------

export interface Original { id: string; type: string; status: string; date: string; description: string; categoryId: string | null; loanId: string | null }

export async function lockOriginal(q: Query, userId: string, id: string): Promise<Original> {
  if (!idSchema.safeParse(id).success) throw notFound("Movimiento");
  const r = await q(
    `select id, type::text as type, status::text as status, date::text as date, description,
            category_id as "categoryId", loan_id as "loanId"
     from transactions where id = $1 and user_id = $2 for update`,
    [id, userId],
  );
  if (!r.rows[0]) throw notFound("Movimiento");
  return r.rows[0] as unknown as Original;
}

function assertReversible(o: Original) {
  if (o.type === "reversal") throw new DomainError("IS_REVERSAL", "Una reversa no se puede anular ni corregir.");
  if (o.status === "reversed") throw new DomainError("ALREADY_REVERSED", "Este movimiento ya fue anulado.");
  if (o.loanId) throw new DomainError("LOAN_MOVEMENT", "Los pagos de préstamos se anulan desde el módulo de préstamos.");
}

/** Inserts the exact negation of `o` (same accounts, kinds and value dates) and marks `o` reversed. */
export async function reverse(q: Query, userId: string, o: Original, reason?: string): Promise<string> {
  const h = await q(
    `insert into transactions (user_id, type, date, description, notes, category_id, loan_id, reverses_id)
     values ($1,'reversal',$2,$3,$4,$5,$6,$7) returning id`,
    [userId, o.date, `Anulación: ${o.description}`.slice(0, 200), reason ?? null, o.categoryId, o.loanId, o.id],
  );
  const revId = h.rows[0].id as string;
  await q(
    `insert into entries (transaction_id, user_id, account_id, currency, kind, amount_minor, date)
     select $1, user_id, account_id, currency, kind, -amount_minor, date from entries where transaction_id = $2`,
    [revId, o.id],
  );
  await audit(q, userId, "txn.reverse", "transaction", revId, null, { reverses: o.id, reason: reason ?? null });
  return revId;
}

export async function markReversed(q: Query, userId: string, id: string, replacedBy: string | null) {
  await q(`update transactions set status = 'reversed', replaced_by_id = $3, updated_at = now() where id = $1 and user_id = $2`, [id, userId, replacedBy]);
}

/** "Anular": reversal only, no replacement. */
export async function voidMovement(ex: Executor, userId: string, id: string, reason?: string) {
  const note = reason?.trim().slice(0, 1000) || undefined;
  return ex.transaction(async (q) => {
    const o = await lockOriginal(q, userId, id);
    assertReversible(o);
    const reversalId = await reverse(q, userId, o, note);
    await markReversed(q, userId, o.id, null);
    await audit(q, userId, "txn.void", "transaction", o.id, { status: "posted" }, { status: "reversed", reversalId, reason: note ?? null });
    return { reversalId };
  });
}

/** Amount/account/date/type edits: reversal of the original + a new transaction, atomically. */
export async function correctMovement(ex: Executor, userId: string, id: string, raw: MovementInput) {
  const input = movementSchema.parse({ ...raw, idempotencyKey: undefined });
  return ex.transaction(async (q) => {
    const o = await lockOriginal(q, userId, id);
    assertReversible(o);
    const reversalId = await reverse(q, userId, o, "Corrección");
    const newId = await postTransaction(q, userId, await buildTransaction(q, userId, input));
    await markReversed(q, userId, o.id, newId);
    await audit(q, userId, "txn.correct", "transaction", o.id,
      { status: "posted" }, { status: "reversed", reversalId, replacedBy: newId });
    return { reversalId, newId };
  });
}

/** Description / notes / category: in place + audit with before/after. */
export async function updateMovementMeta(ex: Executor, userId: string, id: string, raw: z.input<typeof movementMetaSchema>) {
  const i = movementMetaSchema.parse(raw);
  await ex.transaction(async (q) => {
    const o = await lockOriginal(q, userId, id);
    if (o.type === "reversal") throw new DomainError("IS_REVERSAL", "Una reversa no se puede editar.");
    const cur = await q(`select notes, category_id from transactions where id = $1`, [id]);
    const before = { description: o.description, notes: (cur.rows[0].notes as string | null) ?? null, categoryId: o.categoryId };
    let categoryId = o.categoryId;
    if (i.categoryId !== undefined && i.categoryId !== o.categoryId) {
      if (o.type !== "income" && o.type !== "expense") throw new DomainError("NO_CATEGORY", "Este tipo de movimiento no tiene categoría.");
      if (o.status !== "posted") throw new DomainError("ALREADY_REVERSED", "No se puede cambiar la categoría de un movimiento anulado.");
      await categoryOfKind(q, userId, i.categoryId, o.type);
      categoryId = i.categoryId;
    }
    await q(`update transactions set description = $3, notes = $4, category_id = $5, updated_at = now() where id = $1 and user_id = $2`, [
      id, userId, i.description, i.notes ?? null, categoryId,
    ]);
    await audit(q, userId, "txn.update", "transaction", id, before, { description: i.description, notes: i.notes ?? null, categoryId });
  });
}

// ---- reads --------------------------------------------------------------------

export interface MovementLeg { accountId: string; accountName: string; currency: Currency; kind: EntryKind; amountMinor: bigint }
export interface MovementRow {
  id: string; type: string; date: string; description: string; notes: string | null; status: "posted" | "reversed";
  categoryId: string | null; categoryName: string | null; reversesId: string | null; replacedById: string | null;
  fxRate: string | null; createdAt: string; legs: MovementLeg[];
}

const LEGS = `(select coalesce(json_agg(json_build_object('accountId', e.account_id, 'accountName', a.name,
    'currency', e.currency::text, 'kind', e.kind::text, 'amountMinor', e.amount_minor::text) order by e.amount_minor, e.id), '[]'::json)
  from entries e join accounts a on a.id = e.account_id where e.transaction_id = t.id)`;

const MOVEMENT_SELECT = `
  select t.id, t.type::text as type, t.date::text as date, t.description, t.notes, t.status::text as status,
         t.category_id, c.name as category_name, t.reverses_id, t.replaced_by_id, t.fx_rate::text as fx_rate,
         t.created_at::text as created_at, ${LEGS} as legs
  from transactions t left join categories c on c.id = t.category_id`;

function mapMovement(r: Row): MovementRow {
  const legs = (r.legs as { accountId: string; accountName: string; currency: Currency; kind: EntryKind; amountMinor: string }[]).map((l) => ({
    ...l, amountMinor: BigInt(l.amountMinor),
  }));
  return {
    id: r.id as string, type: r.type as string, date: r.date as string, description: r.description as string,
    notes: (r.notes as string | null) ?? null, status: r.status as "posted" | "reversed",
    categoryId: (r.category_id as string | null) ?? null, categoryName: (r.category_name as string | null) ?? null,
    reversesId: (r.reverses_id as string | null) ?? null, replacedById: (r.replaced_by_id as string | null) ?? null,
    fxRate: (r.fx_rate as string | null) ?? null, createdAt: r.created_at as string, legs,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export async function listMovements(ex: Executor, userId: string, raw: MovementFilters = {}) {
  const f = movementFiltersSchema.parse(raw);
  const params: unknown[] = [userId];
  const where = ["t.user_id = $1"];
  const p = (v: unknown) => (params.push(v), `$${params.length}`);
  if (f.from) where.push(`t.date >= ${p(f.from)}`);
  if (f.to) where.push(`t.date <= ${p(f.to)}`);
  if (f.types?.length) where.push(`t.type::text = any(${p(f.types)}::text[])`);
  if (f.status) where.push(`t.status::text = ${p(f.status)}`);
  if (f.categoryId) where.push(`t.category_id = ${p(f.categoryId)}`);
  if (f.accountId) where.push(`exists (select 1 from entries e where e.transaction_id = t.id and e.account_id = ${p(f.accountId)})`);
  if (f.currency) where.push(`exists (select 1 from entries e where e.transaction_id = t.id and e.currency::text = ${p(f.currency)})`);
  if (f.q) {
    const like = p(`%${escapeLike(f.q)}%`);
    where.push(`(t.description ilike ${like} escape '\\' or t.notes ilike ${like} escape '\\')`);
  }
  const w = where.join(" and ");
  const total = Number((await ex.query(`select count(*)::int as n from transactions t where ${w}`, params)).rows[0].n);
  const r = await ex.query(
    `${MOVEMENT_SELECT} where ${w} order by t.date desc, t.created_at desc, t.id desc
     limit ${p(f.pageSize)} offset ${p((f.page - 1) * f.pageSize)}`,
    params,
  );
  return { items: r.rows.map(mapMovement), total, page: f.page, pageSize: f.pageSize };
}

export interface AuditEntry { id: string; action: string; before: unknown; after: unknown; createdAt: string }
export interface MovementDetail extends MovementRow {
  /** Transaction this one reverses (when `type = reversal`). */
  reverses: MovementRow | null;
  /** Reversal that cancelled this one, and the corrected replacement if any. */
  reversal: MovementRow | null;
  replacedBy: MovementRow | null;
  history: AuditEntry[];
}

export async function getMovement(ex: Executor, userId: string, id: string): Promise<MovementDetail> {
  if (!idSchema.safeParse(id).success) throw notFound("Movimiento");
  const one = async (where: string, v: string) => {
    const r = await ex.query(`${MOVEMENT_SELECT} where t.user_id = $1 and ${where}`, [userId, v]);
    return r.rows[0] ? mapMovement(r.rows[0]) : null;
  };
  const m = await one("t.id = $2", id);
  if (!m) throw notFound("Movimiento");
  const [reverses, reversal, replacedBy] = await Promise.all([
    m.reversesId ? one("t.id = $2", m.reversesId) : null,
    one("t.reverses_id = $2", m.id),
    m.replacedById ? one("t.id = $2", m.replacedById) : null,
  ]);
  const h = await ex.query(
    `select id::text as id, action, before, after, created_at::text as "createdAt" from audit_log
     where user_id = $1 and entity_type = 'transaction' and entity_id = $2 order by id`,
    [userId, id],
  );
  return { ...m, reverses, reversal, replacedBy, history: h.rows as unknown as AuditEntry[] };
}

