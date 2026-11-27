-- 0008_market.sql
-- Market Watch. Market data is NOT financial data of the user: the quote cache is global (per provider),
-- watchlists/favorites are user-scoped (same composite-FK tenant pattern as the ledger tables; user_id is text, no FK to neon_auth).
-- Nothing here trades or touches accounts/entries.

-- Short-TTL cache (TTL enforced in code). payload keeps the PROVIDER's own timestamp; it is never re-stamped on read.
create table market_quotes_cache (
  provider    text        not null,
  symbol      text        not null,
  payload     jsonb       not null,
  provider_ts timestamptz,
  fetched_at  timestamptz not null default now(),
  status      text        not null check (status in ('realtime', 'delayed', 'unavailable')),
  primary key (provider, symbol)
);

create table watchlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  name       text not null check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table watchlist_items (
  watchlist_id uuid not null,
  user_id      text not null,
  symbol       text not null check (symbol ~ '^[A-Z0-9][A-Z0-9./-]{0,19}$'),
  created_at   timestamptz not null default now(),
  primary key (watchlist_id, symbol),
  foreign key (watchlist_id, user_id) references watchlists (id, user_id) on delete cascade
);

create table favorites (
  user_id    text not null,
  symbol     text not null check (symbol ~ '^[A-Z0-9][A-Z0-9./-]{0,19}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
