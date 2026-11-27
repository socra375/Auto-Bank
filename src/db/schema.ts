/**
 * Drizzle mirror of db/migrations/*.sql (the SQL files are the source of truth).
 * Triggers, CHECKs and the deferred leg validation live only in SQL; the views are
 * declared `.existing()` so drizzle never tries to create them.
 *
 * user_id is `text` WITHOUT a foreign key: users live in Neon Auth (neon_auth."user").
 * Do not run drizzle-kit generate/push against this schema; apply db/migrations instead.
 */
import {
  bigint, bigserial, boolean, date, foreignKey, index, inet, jsonb, numeric,
  pgEnum, pgTable, pgView, text, timestamp, unique, uuid,
} from "drizzle-orm/pg-core";

export const currencyEnum = pgEnum("currency", ["DOP", "USD"]);
export const accountTypeEnum = pgEnum("account_type", ["cash", "bank", "savings", "digital"]);
export const recordStatusEnum = pgEnum("record_status", ["active", "archived"]);
export const categoryKindEnum = pgEnum("category_kind", ["income", "expense"]);
export const txnTypeEnum = pgEnum("txn_type", [
  "income", "expense", "transfer", "adjustment", "loan_disbursement",
  "loan_proceeds", "loan_collection", "loan_repayment", "reversal",
]);
export const txnStatusEnum = pgEnum("txn_status", ["posted", "reversed"]);
export const entryKindEnum = pgEnum("entry_kind", [
  "income", "expense", "transfer", "adjustment", "loan_principal", "loan_interest",
]);
export const loanDirectionEnum = pgEnum("loan_direction", ["receivable", "payable"]);
export const assetTypeEnum = pgEnum("asset_type", ["real_estate", "vehicle", "technology", "furniture", "other"]);
export const assetStatusEnum = pgEnum("asset_status", ["active", "disposed"]);
export const actorEnum = pgEnum("actor", ["user", "eddie", "system"]);

const money = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  currency: currencyEnum("currency").notNull(),
  openingBalanceMinor: money("opening_balance_minor").notNull().default(0),
  openingDate: date("opening_date").notNull(),
  description: text("description"),
  status: recordStatusEnum("status").notNull().default("active"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
}, (t) => [
  unique().on(t.userId, t.name),
  unique().on(t.id, t.userId),
  unique().on(t.id, t.userId, t.currency),
  index("accounts_user_status_idx").on(t.userId, t.status),
]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  kind: categoryKindEnum("kind").notNull(),
  color: text("color"),
  status: recordStatusEnum("status").notNull().default("active"),
  createdAt: ts("created_at"),
}, (t) => [unique().on(t.userId, t.kind, t.name), unique().on(t.id, t.userId)]);

export const loans = pgTable("loans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  direction: loanDirectionEnum("direction").notNull(),
  counterparty: text("counterparty").notNull(),
  principalMinor: money("principal_minor").notNull(),
  currency: currencyEnum("currency").notNull(),
  startDate: date("start_date").notNull(),
  dueDate: date("due_date"),
  interestRatePct: numeric("interest_rate_pct", { precision: 7, scale: 4 }),
  accountId: uuid("account_id"),
  fundedFromAccount: boolean("funded_from_account").notNull().default(false),
  notes: text("notes"),
  createdAt: ts("created_at"),
}, (t) => [
  unique().on(t.id, t.userId),
  foreignKey({ columns: [t.accountId, t.userId], foreignColumns: [accounts.id, accounts.userId] }),
  index("loans_user_direction_idx").on(t.userId, t.direction),
  index("loans_user_due_idx").on(t.userId, t.dueDate),
  index("loans_account_idx").on(t.accountId),
]);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  type: txnTypeEnum("type").notNull(),
  date: date("date").notNull(),
  description: text("description").notNull(),
  notes: text("notes"),
  categoryId: uuid("category_id"),
  loanId: uuid("loan_id"),
  status: txnStatusEnum("status").notNull().default("posted"),
  reversesId: uuid("reverses_id").unique(),
  replacedById: uuid("replaced_by_id"),
  fxRate: numeric("fx_rate", { precision: 18, scale: 6 }),
  createdBy: actorEnum("created_by").notNull().default("user"),
  idempotencyKey: text("idempotency_key"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
}, (t) => [
  unique().on(t.id, t.userId),
  unique().on(t.userId, t.idempotencyKey),
  foreignKey({ columns: [t.categoryId, t.userId], foreignColumns: [categories.id, categories.userId] }),
  foreignKey({ columns: [t.loanId, t.userId], foreignColumns: [loans.id, loans.userId] }),
  foreignKey({ columns: [t.reversesId, t.userId], foreignColumns: [t.id, t.userId] }),
  foreignKey({ columns: [t.replacedById, t.userId], foreignColumns: [t.id, t.userId] }),
  index("transactions_user_date_idx").on(t.userId, t.date.desc()),
  index("transactions_user_type_date_idx").on(t.userId, t.type, t.date),
  index("transactions_loan_idx").on(t.loanId),
  index("transactions_category_idx").on(t.categoryId),
]);

export const entries = pgTable("entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: uuid("account_id").notNull(),
  currency: currencyEnum("currency").notNull(),
  kind: entryKindEnum("kind").notNull(),
  amountMinor: money("amount_minor").notNull(), // signed, never 0
  date: date("date").notNull(),
  createdAt: ts("created_at"),
}, (t) => [
  foreignKey({ columns: [t.transactionId, t.userId], foreignColumns: [transactions.id, transactions.userId] }),
  foreignKey({ columns: [t.accountId, t.userId, t.currency], foreignColumns: [accounts.id, accounts.userId, accounts.currency] }),
  index("entries_account_date_idx").on(t.accountId, t.date),
  index("entries_user_kind_date_idx").on(t.userId, t.kind, t.date),
  index("entries_transaction_idx").on(t.transactionId),
]);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: text("user_id").notNull(),
  actor: actorEnum("actor").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  requestId: uuid("request_id"),
  ip: inet("ip"),
  createdAt: ts("created_at"),
}, (t) => [
  index("audit_log_entity_idx").on(t.userId, t.entityType, t.entityId),
  index("audit_log_created_idx").on(t.userId, t.createdAt.desc()),
]);

export const exchangeRates = pgTable("exchange_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  base: currencyEnum("base").notNull(),
  quote: currencyEnum("quote").notNull(),
  rate: numeric("rate", { precision: 18, scale: 6 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  source: text("source").notNull().default("manual"),
  createdAt: ts("created_at"),
}, (t) => [unique().on(t.userId, t.base, t.quote, t.effectiveDate)]);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  type: assetTypeEnum("type").notNull(),
  currency: currencyEnum("currency").notNull(),
  acquiredOn: date("acquired_on"),
  acquisitionCostMinor: money("acquisition_cost_minor"),
  description: text("description"),
  status: assetStatusEnum("status").notNull().default("active"),
  disposedOn: date("disposed_on"),
  createdAt: ts("created_at"),
}, (t) => [unique().on(t.id, t.userId), index("assets_user_idx").on(t.userId, t.status)]);

export const assetValuations = pgTable("asset_valuations", {
  id: uuid("id").primaryKey().defaultRandom(),
  seq: bigserial("seq", { mode: "number" }).notNull(),
  assetId: uuid("asset_id").notNull(),
  userId: text("user_id").notNull(),
  valueMinor: money("value_minor").notNull(),
  valuedOn: date("valued_on").notNull(),
  source: text("source"),
  note: text("note"),
  createdAt: ts("created_at"),
}, (t) => [
  foreignKey({ columns: [t.assetId, t.userId], foreignColumns: [assets.id, assets.userId] }),
  index("asset_valuations_latest_idx").on(t.assetId, t.valuedOn.desc(), t.seq.desc()),
]);

// Views (defined in 0002_views.sql). Read-only.
export const accountBalances = pgView("account_balances", {
  accountId: uuid("account_id"), userId: text("user_id"), currency: currencyEnum("currency"),
  status: recordStatusEnum("status"), openingBalanceMinor: money("opening_balance_minor"),
  entriesMinor: money("entries_minor"), balanceMinor: money("balance_minor"),
}).existing();

export const loanBalances = pgView("loan_balances", {
  loanId: uuid("loan_id"), userId: text("user_id"), direction: loanDirectionEnum("direction"),
  currency: currencyEnum("currency"), principalMinor: money("principal_minor"), dueDate: date("due_date"),
  principalPaidMinor: money("principal_paid_minor"), interestPaidMinor: money("interest_paid_minor"),
  outstandingMinor: money("outstanding_minor"),
  status: text("status", { enum: ["pendiente", "parcial", "liquidado", "vencido"] }),
}).existing();

export const flowEntries = pgView("flow_entries", {
  entryId: uuid("entry_id"), userId: text("user_id"), accountId: uuid("account_id"),
  currency: currencyEnum("currency"), date: date("date"),
  flow: text("flow", { enum: ["income", "expense"] }), amountMinor: money("amount_minor"),
}).existing();

export const assetCurrentValues = pgView("asset_current_values", {
  assetId: uuid("asset_id"), userId: text("user_id"), currency: currencyEnum("currency"),
  valueMinor: money("value_minor"), valuedOn: date("valued_on"),
}).existing();

