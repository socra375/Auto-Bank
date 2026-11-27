-- 0001_core_tables.sql
-- Core ledger tables. Money is bigint minor units (cents). Never float.
--
-- AUTH NOTE: users live in Neon Auth (neon_auth."user"). Every table below carries
-- `user_id text not null` with NO foreign key to the neon_auth schema (its id type is
-- managed by Neon and the schema is outside our migrations). Tenant isolation is
-- enforced inside our schema through composite FKs (id, user_id) instead.

create type currency       as enum ('DOP', 'USD');
create type account_type   as enum ('cash', 'bank', 'savings', 'digital');
create type record_status  as enum ('active', 'archived');
create type category_kind  as enum ('income', 'expense');
create type txn_type       as enum (
  'income', 'expense', 'transfer', 'adjustment',
  'loan_disbursement',  -- I lend money (receivable): money leaves an account
  'loan_proceeds',      -- I borrow (payable): money enters an account
  'loan_collection',    -- repayment received on a receivable
  'loan_repayment',     -- repayment made on a payable
  'reversal'
);
create type txn_status     as enum ('posted', 'reversed');
create type entry_kind     as enum ('income', 'expense', 'transfer', 'adjustment', 'loan_principal', 'loan_interest');
create type loan_direction as enum ('receivable', 'payable');
create type asset_type     as enum ('real_estate', 'vehicle', 'technology', 'furniture', 'other');
create type asset_status   as enum ('active', 'disposed');
create type actor          as enum ('user', 'eddie', 'system');

create table accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               text not null,
  name                  text not null check (length(btrim(name)) > 0),
  type                  account_type not null,
  currency              currency not null,           -- immutable (trigger in 0003)
  opening_balance_minor bigint not null default 0,
  opening_date          date not null,
  description           text,
  status                record_status not null default 'active',  -- archive, never delete
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id),
  unique (id, user_id, currency)                     -- target of entries' composite FK
);
create index accounts_user_status_idx on accounts (user_id, status);

create table categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  name       text not null check (length(btrim(name)) > 0),
  kind       category_kind not null,
  color      text,
  status     record_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (user_id, kind, name),
  unique (id, user_id)
);

create table loans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null,
  direction           loan_direction not null,
  counterparty        text not null check (length(btrim(counterparty)) > 0),
  principal_minor     bigint not null check (principal_minor > 0),
  currency            currency not null,
  start_date          date not null,
  due_date            date,
  interest_rate_pct   numeric(7,4) check (interest_rate_pct is null or interest_rate_pct >= 0), -- informational
  account_id          uuid,
  funded_from_account boolean not null default false,  -- false: pre-existing debt, no money movement
  notes               text,
  created_at          timestamptz not null default now(),
  check (due_date is null or due_date >= start_date),
  check (not funded_from_account or account_id is not null),
  unique (id, user_id),
  foreign key (account_id, user_id) references accounts (id, user_id)
);
create index loans_user_direction_idx on loans (user_id, direction);
create index loans_user_due_idx       on loans (user_id, due_date);
create index loans_account_idx        on loans (account_id);

create table transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  type            txn_type not null,
  date            date not null,
  description     text not null check (length(btrim(description)) > 0),
  notes           text,
  category_id     uuid,
  loan_id         uuid,
  status          txn_status not null default 'posted',
  reverses_id     uuid unique,                        -- unique: a transaction is reversed at most once
  replaced_by_id  uuid,
  fx_rate         numeric(18,6) check (fx_rate is null or fx_rate > 0),  -- informational, cross-currency transfer
  created_by      actor not null default 'user',
  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, idempotency_key),                  -- NULLs are distinct: key is optional
  foreign key (category_id, user_id)    references categories   (id, user_id),
  foreign key (loan_id, user_id)        references loans        (id, user_id),
  foreign key (reverses_id, user_id)    references transactions (id, user_id),
  foreign key (replaced_by_id, user_id) references transactions (id, user_id),
  check ((type in ('income', 'expense')) = (category_id is not null) or type = 'reversal'),
  check (type = 'reversal' or (type::text like 'loan\_%') = (loan_id is not null)),
  check ((type = 'reversal') = (reverses_id is not null)),
  check (reverses_id is distinct from id)
);
create index transactions_user_date_idx      on transactions (user_id, date desc);
create index transactions_user_type_date_idx on transactions (user_id, type, date);
create index transactions_loan_idx           on transactions (loan_id);
create index transactions_category_idx       on transactions (category_id);

create table entries (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  user_id        text not null,
  account_id     uuid not null,
  currency       currency not null,
  kind           entry_kind not null,
  amount_minor   bigint not null check (amount_minor <> 0),  -- signed: + into account, - out of account
  date           date not null,                              -- value date (copy of txn date)
  created_at     timestamptz not null default now(),
  foreign key (transaction_id, user_id)       references transactions (id, user_id),
  -- DB guarantees entry currency = account currency and same owner:
  foreign key (account_id, user_id, currency) references accounts (id, user_id, currency)
);
create index entries_account_date_idx on entries (account_id, date);
create index entries_user_kind_date_idx on entries (user_id, kind, date);
create index entries_transaction_idx  on entries (transaction_id);

create table audit_log (
  id          bigint generated always as identity primary key,
  user_id     text not null,
  actor       actor not null,
  action      text not null,          -- e.g. txn.create, txn.reverse, account.archive
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  request_id  uuid,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx  on audit_log (user_id, entity_type, entity_id);
create index audit_log_created_idx on audit_log (user_id, created_at desc);

create table exchange_rates (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,
  base           currency not null,
  quote          currency not null,
  rate           numeric(18,6) not null check (rate > 0),   -- 1 base = rate quote
  effective_date date not null,
  source         text not null default 'manual',
  created_at     timestamptz not null default now(),
  check (base <> quote),
  unique (user_id, base, quote, effective_date)
);

create table assets (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  text not null,
  name                     text not null check (length(btrim(name)) > 0),
  type                     asset_type not null,
  currency                 currency not null,
  acquired_on              date,
  acquisition_cost_minor   bigint check (acquisition_cost_minor is null or acquisition_cost_minor >= 0),
  description              text,
  status                   asset_status not null default 'active',
  disposed_on              date,
  created_at               timestamptz not null default now(),
  check ((status = 'disposed') = (disposed_on is not null)),
  unique (id, user_id)
);
create index assets_user_idx on assets (user_id, status);

create table asset_valuations (
  id         uuid primary key default gen_random_uuid(),
  seq        bigint generated always as identity,       -- deterministic tie-break for "latest"
  asset_id   uuid not null,
  user_id    text not null,
  value_minor bigint not null check (value_minor >= 0),
  valued_on  date not null,
  source     text,
  note       text,
  created_at timestamptz not null default now(),
  foreign key (asset_id, user_id) references assets (id, user_id)
);
create index asset_valuations_latest_idx on asset_valuations (asset_id, valued_on desc, seq desc);
