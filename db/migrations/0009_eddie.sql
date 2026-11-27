-- 0009_eddie.sql
-- Eddie (assistant). Conversation history (last 50 per owner, pruned in code) and write PROPOSALS.
-- A proposal never touches the ledger: it is only executed when the owner confirms it through a
-- server action (not a model tool). Same user-scoped composite-FK pattern as the ledger tables.

create table eddie_messages (
  id         bigint generated always as identity primary key,
  user_id    text        not null,
  role       text        not null check (role in ('user', 'assistant')),
  content    jsonb       not null,
  created_at timestamptz not null default now()
);
create index eddie_messages_user_idx on eddie_messages (user_id, id desc);

create table eddie_proposals (
  id           uuid primary key default gen_random_uuid(),
  user_id      text        not null,
  kind         text        not null check (kind in ('income', 'expense', 'transfer')),
  payload      jsonb       not null,
  payload_hash text        not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status       text        not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'expired')),
  preview      jsonb       not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  decided_at   timestamptz,
  result_txn_id uuid,
  unique (id, user_id),
  foreign key (result_txn_id, user_id) references transactions (id, user_id),
  -- a confirmed proposal always points to its transaction; only a confirmed one does
  check ((status = 'confirmed') = (result_txn_id is not null)),
  -- decided_at is set exactly when the proposal left 'pending'
  check ((status = 'pending') = (decided_at is null))
);
create index eddie_proposals_user_idx on eddie_proposals (user_id, status, created_at desc);

-- A decided proposal is final: it can never go back to pending nor change in any way.
create function eddie_proposals_final() returns trigger language plpgsql as $$
begin
  if old.status <> 'pending' then
    raise exception 'eddie_proposals: a decided proposal is immutable' using errcode = '23514';
  end if;
  if new.user_id <> old.user_id or new.kind <> old.kind then
    raise exception 'eddie_proposals: owner and kind are immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger eddie_proposals_final before update on eddie_proposals
  for each row execute function eddie_proposals_final();
