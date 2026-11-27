import { emptyTotals, sumByCurrency, type Currency, type TotalsByCurrency } from "@/lib/money";
import { audit } from "./audit";
import { DomainError, isUniqueViolation, notFound } from "./errors";
import type { Executor, Query, Row } from "./executor";
import { accountCreateSchema, accountEditSchema, idSchema } from "./schemas";
import type { z } from "zod";

export type AccountType = "cash" | "bank" | "savings" | "digital";
export interface AccountWithBalance {
  id: string; name: string; type: AccountType; currency: Currency; description: string | null;
  status: "active" | "archived"; openingDate: string;
  openingBalanceMinor: bigint; entriesMinor: bigint; balanceMinor: bigint;
}

const SELECT = `
  select a.id, a.name, a.type::text as type, a.currency::text as currency, a.description,
         a.status::text as status, a.opening_date::text as opening_date,
         b.opening_balance_minor::text as opening_balance_minor,
         b.entries_minor::text as entries_minor, b.balance_minor::text as balance_minor
  from accounts a join account_balances b on b.account_id = a.id`;

const map = (r: Row): AccountWithBalance => ({
  id: r.id as string, name: r.name as string, type: r.type as AccountType, currency: r.currency as Currency,
  description: (r.description as string | null) ?? null, status: r.status as "active" | "archived",
  openingDate: r.opening_date as string,
  openingBalanceMinor: BigInt(r.opening_balance_minor as string),
  entriesMinor: BigInt(r.entries_minor as string),
  balanceMinor: BigInt(r.balance_minor as string),
});

/** Balances come from the account_balances view (opening + SUM(entries)); nothing is stored. */
export async function listAccounts(ex: Executor, userId: string): Promise<AccountWithBalance[]> {
  const r = await ex.query(`${SELECT} where a.user_id = $1 order by (a.status = 'archived'), a.name`, [userId]);
  return r.rows.map(map);
}

export async function getAccount(q: Query, userId: string, id: string): Promise<AccountWithBalance> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) throw notFound("Cuenta");
  const r = await q(`${SELECT} where a.id = $1 and a.user_id = $2`, [id, userId]);
  if (!r.rows[0]) throw notFound("Cuenta");
  return map(r.rows[0]);
}

/** Totals are per currency, active accounts only; DOP and USD are never added together. */
export function totalsByCurrency(accounts: readonly AccountWithBalance[]): TotalsByCurrency {
  const active = accounts.filter((a) => a.status === "active");
  return active.length ? sumByCurrency(active.map((a) => ({ minor: a.balanceMinor, currency: a.currency }))) : emptyTotals();
}

const dupName = (e: unknown) => {
  if (isUniqueViolation(e)) throw new DomainError("DUPLICATE", "Ya existe una cuenta con ese nombre.");
  throw e;
};

export async function createAccount(ex: Executor, userId: string, raw: z.input<typeof accountCreateSchema>) {
  const i = accountCreateSchema.parse(raw);
  try {
    return await ex.transaction(async (q) => {
      const r = await q(
        `insert into accounts (user_id, name, type, currency, opening_balance_minor, opening_date, description)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [userId, i.name, i.type, i.currency, i.openingBalance.toString(), i.openingDate, i.description ?? null],
      );
      const id = r.rows[0].id as string;
      await audit(q, userId, "account.create", "account", id, null, { ...i });
      return id;
    });
  } catch (e) {
    return dupName(e);
  }
}

/** Only name/description are editable; currency, type and opening data are historical facts. */
export async function updateAccount(ex: Executor, userId: string, id: string, raw: z.input<typeof accountEditSchema>) {
  const i = accountEditSchema.parse(raw);
  try {
    await ex.transaction(async (q) => {
      const before = await getAccount(q, userId, id);
      await q(`update accounts set name = $3, description = $4, updated_at = now() where id = $1 and user_id = $2`, [
        id, userId, i.name, i.description ?? null,
      ]);
      await audit(q, userId, "account.update", "account", id,
        { name: before.name, description: before.description }, { name: i.name, description: i.description ?? null });
    });
  } catch (e) {
    dupName(e);
  }
}

/** Never deletes. A non-zero balance needs explicit confirmation (PLAN rule 9). */
export async function archiveAccount(ex: Executor, userId: string, id: string, opts: { confirmNonZero?: boolean } = {}) {
  await ex.transaction(async (q) => {
    const a = await getAccount(q, userId, id);
    if (a.status === "archived") throw new DomainError("ALREADY_ARCHIVED", "La cuenta ya está archivada.");
    if (a.balanceMinor !== 0n && !opts.confirmNonZero) {
      throw new DomainError("NON_ZERO_BALANCE", "La cuenta tiene saldo distinto de cero. Confirma para archivarla.");
    }
    await q(`update accounts set status = 'archived', updated_at = now() where id = $1 and user_id = $2`, [id, userId]);
    await audit(q, userId, "account.archive", "account", id, { status: "active" }, { status: "archived" });
  });
}

export async function unarchiveAccount(ex: Executor, userId: string, id: string) {
  await ex.transaction(async (q) => {
    const a = await getAccount(q, userId, id);
    if (a.status === "active") throw new DomainError("NOT_ARCHIVED", "La cuenta ya está activa.");
    await q(`update accounts set status = 'active', updated_at = now() where id = $1 and user_id = $2`, [id, userId]);
    await audit(q, userId, "account.unarchive", "account", id, { status: "archived" }, { status: "active" });
  });
}
