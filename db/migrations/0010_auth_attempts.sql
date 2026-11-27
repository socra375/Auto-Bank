-- 0010_auth_attempts.sql (stage 10 hardening)
-- 1) DB-backed login/sign-up throttle: fixed 15-minute windows per hashed key (no raw IP or email is stored).
create table auth_attempts (
  key          text        not null,
  window_start timestamptz not null,
  attempts     int         not null default 1 check (attempts > 0),
  primary key (key, window_start)
);
create index auth_attempts_window_idx on auth_attempts (window_start);

-- 2) Idempotency keys now remember WHAT was requested: a reused key with a different payload is rejected.
-- NULL = legacy rows and Eddie confirmations (key = proposal id, payload already hash-checked): treated as "same".
alter table transactions     add column request_hash text;
alter table loans            add column request_hash text;
alter table assets           add column request_hash text;
alter table asset_valuations add column request_hash text;
