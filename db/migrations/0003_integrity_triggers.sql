-- 0003_integrity_triggers.sql
-- Last line of defence: the ledger rules hold even if application code is wrong.

-- 1) Append-only tables ------------------------------------------------------
create function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only: % not allowed', tg_table_name, tg_op
    using errcode = 'integrity_constraint_violation';
end $$;

create trigger entries_immutable before update or delete on entries
  for each row execute function forbid_mutation();
create trigger audit_log_immutable before update or delete on audit_log
  for each row execute function forbid_mutation();
create trigger asset_valuations_immutable before update or delete on asset_valuations
  for each row execute function forbid_mutation();

-- Financial records are archived/reversed, never deleted.
create trigger accounts_no_delete before delete on accounts
  for each row execute function forbid_mutation();
create trigger transactions_no_delete before delete on transactions
  for each row execute function forbid_mutation();

-- 2) Account currency is immutable ------------------------------------------
create function accounts_guard() returns trigger language plpgsql as $$
begin
  if new.currency <> old.currency or new.user_id <> old.user_id then
    raise exception 'account currency/owner cannot change' using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;
create trigger accounts_guard before update on accounts
  for each row execute function accounts_guard();

-- 3) Transaction header: only non-financial fields may change ----------------
-- (description, notes, category_id, status, replaced_by_id, updated_at)
create function transactions_guard() returns trigger language plpgsql as $$
begin
  if (new.user_id, new.type, new.date, new.loan_id, new.reverses_id, new.fx_rate, new.created_by, new.idempotency_key)
     is distinct from
     (old.user_id, old.type, old.date, old.loan_id, old.reverses_id, old.fx_rate, old.created_by, old.idempotency_key) then
    raise exception 'financial fields of a transaction are immutable; reverse and repost instead'
      using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;
create trigger transactions_guard before update on transactions
  for each row execute function transactions_guard();

-- 4) No posting to archived accounts (reversals may still touch them) ---------
create function entries_account_active() returns trigger language plpgsql as $$
begin
  if exists (select 1 from accounts where id = new.account_id and status = 'archived')
     and (select type from transactions where id = new.transaction_id) <> 'reversal' then
    raise exception 'cannot post to an archived account' using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;
create trigger entries_account_active before insert on entries
  for each row execute function entries_account_active();

-- 5) Leg shape per movement type, checked at COMMIT (deferred) ---------------
create function check_txn_legs() returns trigger language plpgsql as $$
declare
  t transactions%rowtype;
  o transactions%rowtype;
  l loans%rowtype;
  v_id uuid;
  n int; n_acc int; n_cur int; n_pos int; n_neg int; n_date_bad int;
  n_income int; n_expense int; n_transfer int; n_adjust int; n_principal int; n_interest int;
  total bigint;
  v_paid bigint; v_principal bigint;
begin
  if tg_table_name = 'transactions' then v_id := new.id; else v_id := new.transaction_id; end if;
  select * into t from transactions where id = v_id;

  select count(*), count(distinct account_id), count(distinct currency),
         count(*) filter (where amount_minor > 0), count(*) filter (where amount_minor < 0),
         count(*) filter (where date <> t.date),
         count(*) filter (where kind = 'income'),   count(*) filter (where kind = 'expense'),
         count(*) filter (where kind = 'transfer'), count(*) filter (where kind = 'adjustment'),
         count(*) filter (where kind = 'loan_principal'), count(*) filter (where kind = 'loan_interest'),
         coalesce(sum(amount_minor), 0)
    into n, n_acc, n_cur, n_pos, n_neg, n_date_bad,
         n_income, n_expense, n_transfer, n_adjust, n_principal, n_interest, total
    from entries where transaction_id = v_id;

  if n = 0 then
    raise exception 'transaction % has no entries', v_id using errcode = 'integrity_constraint_violation';
  end if;
  if t.type <> 'reversal' and n_date_bad > 0 then
    raise exception 'entry date must equal transaction date' using errcode = 'integrity_constraint_violation';
  end if;

  if t.type in ('income', 'expense') then
    if (select kind::text from categories where id = t.category_id) <> t.type::text then
      raise exception 'category kind does not match movement type' using errcode = 'integrity_constraint_violation';
    end if;
  end if;

  if t.loan_id is not null then
    select * into l from loans where id = t.loan_id;
    if n_cur <> 1 or (select currency from entries where transaction_id = v_id limit 1) <> l.currency then
      raise exception 'loan movement currency must equal loan currency' using errcode = 'integrity_constraint_violation';
    end if;
  end if;

  case t.type
    when 'income' then
      if not (n = 1 and n_income = 1 and n_pos = 1) then
        raise exception 'income needs exactly 1 positive income leg' using errcode = 'integrity_constraint_violation'; end if;
    when 'expense' then
      if not (n = 1 and n_expense = 1 and n_neg = 1) then
        raise exception 'expense needs exactly 1 negative expense leg' using errcode = 'integrity_constraint_violation'; end if;
    when 'adjustment' then
      if not (n = 1 and n_adjust = 1) then
        raise exception 'adjustment needs exactly 1 adjustment leg' using errcode = 'integrity_constraint_violation'; end if;
    when 'transfer' then
      if not (n = 2 and n_transfer = 2 and n_pos = 1 and n_neg = 1 and n_acc = 2) then
        raise exception 'transfer needs exactly 2 transfer legs (one in, one out) on different accounts'
          using errcode = 'integrity_constraint_violation'; end if;
      if n_cur = 1 and total <> 0 then
        raise exception 'same-currency transfer legs must sum to zero' using errcode = 'integrity_constraint_violation'; end if;
    when 'loan_disbursement' then
      if not (n = 1 and n_principal = 1 and n_neg = 1 and l.direction = 'receivable') then
        raise exception 'loan_disbursement: 1 negative principal leg on a receivable' using errcode = 'integrity_constraint_violation'; end if;
    when 'loan_proceeds' then
      if not (n = 1 and n_principal = 1 and n_pos = 1 and l.direction = 'payable') then
        raise exception 'loan_proceeds: 1 positive principal leg on a payable' using errcode = 'integrity_constraint_violation'; end if;
    when 'loan_collection' then
      if not (n = n_principal + n_interest and n_principal <= 1 and n_interest <= 1 and n_pos = n and l.direction = 'receivable') then
        raise exception 'loan_collection: positive principal and/or interest legs on a receivable' using errcode = 'integrity_constraint_violation'; end if;
    when 'loan_repayment' then
      if not (n = n_principal + n_interest and n_principal <= 1 and n_interest <= 1 and n_neg = n and l.direction = 'payable') then
        raise exception 'loan_repayment: negative principal and/or interest legs on a payable' using errcode = 'integrity_constraint_violation'; end if;
    when 'reversal' then
      select * into o from transactions where id = t.reverses_id;
      if o.type = 'reversal'
         or t.loan_id is distinct from o.loan_id or t.category_id is distinct from o.category_id
         or exists (
              (select account_id, currency, kind, -amount_minor, date from entries where transaction_id = o.id
               except
               select account_id, currency, kind, amount_minor, date from entries where transaction_id = t.id)
              union all
              (select account_id, currency, kind, amount_minor, date from entries where transaction_id = t.id
               except
               select account_id, currency, kind, -amount_minor, date from entries where transaction_id = o.id)) then
        raise exception 'reversal must be the exact negation of the original entries' using errcode = 'integrity_constraint_violation';
      end if;
  end case;

  -- Loan principal can never be overpaid nor negative (also after reversals).
  if t.loan_id is not null and t.type in ('loan_collection', 'loan_repayment', 'reversal') then
    select principal_paid_minor, principal_minor into v_paid, v_principal from loan_balances where loan_id = t.loan_id;
    if v_paid < 0 or v_paid > v_principal then
      raise exception 'loan principal payments out of range (paid %, principal %)', v_paid, v_principal
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;
  return null;
end $$;

create constraint trigger txn_header_legs after insert on transactions
  deferrable initially deferred for each row execute function check_txn_legs();
create constraint trigger txn_entry_legs after insert on entries
  deferrable initially deferred for each row execute function check_txn_legs();
