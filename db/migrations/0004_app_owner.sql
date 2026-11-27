-- Single-owner gate. Neon Auth sign-up is open, so authentication is not authorization:
-- the first authenticated user to claim ownership is the only user the app serves.
-- user_id is the neon_auth."user".id uuid stored as text (no FK: neon_auth is managed).
create table app_owner (
  user_id    text primary key,
  created_at timestamptz not null default now()
);

-- Constant expression index => at most ONE row can ever exist.
create unique index app_owner_single_row on app_owner ((true));
