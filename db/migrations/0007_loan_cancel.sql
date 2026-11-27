-- 0007_loan_cancel.sql
-- A loan can be cancelled (origination voided, or an unfunded loan entered by mistake). Cancelled loans are
-- history only: status 'cancelado', no new money movements, excluded from totals by every consumer.
alter table loans add column if not exists cancelled_at timestamptz;

-- Same columns/order/types as 0002, plus cancelled_at appended at the end. status gains 'cancelado' (first precedence).
create or replace view loan_balances as
with eff as (
  select t.loan_id, e.kind, e.amount_minor, coalesce(o.type, t.type) as eff_type
  from entries e
  join transactions t on t.id = e.transaction_id
  left join transactions o on o.id = t.reverses_id
  where t.loan_id is not null
), paid as (
  select loan_id,
         sum(case when kind = 'loan_principal' then
               case eff_type when 'loan_collection' then amount_minor
                             when 'loan_repayment'  then -amount_minor else 0 end
             else 0 end)::bigint as principal_paid_minor,
         sum(case when kind = 'loan_interest' then
               case eff_type when 'loan_collection' then amount_minor
                             when 'loan_repayment'  then -amount_minor else 0 end
             else 0 end)::bigint as interest_paid_minor
  from eff group by loan_id
)
select l.id as loan_id, l.user_id, l.direction, l.currency, l.principal_minor, l.due_date,
       coalesce(p.principal_paid_minor, 0) as principal_paid_minor,
       coalesce(p.interest_paid_minor, 0)  as interest_paid_minor,
       l.principal_minor - coalesce(p.principal_paid_minor, 0) as outstanding_minor,
       case
         when l.cancelled_at is not null then 'cancelado'
         when l.principal_minor - coalesce(p.principal_paid_minor, 0) = 0 then 'liquidado'
         when l.due_date < (now() at time zone 'America/Santo_Domingo')::date then 'vencido'
         when coalesce(p.principal_paid_minor, 0) > 0 then 'parcial'
         else 'pendiente'
       end as status,
       l.cancelled_at
from loans l
left join paid p on p.loan_id = l.id;

-- Only reversals may touch a cancelled loan (voiding the origination posts its reversal before cancelling).
create or replace function reject_cancelled_loan_txn() returns trigger language plpgsql as $$
begin
  if new.loan_id is not null and new.type <> 'reversal'
     and exists (select 1 from loans where id = new.loan_id and cancelled_at is not null) then
    raise exception 'loan % is cancelled: no new movements allowed', new.loan_id using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_reject_cancelled_loan_txn on transactions;
create trigger trg_reject_cancelled_loan_txn before insert on transactions
  for each row execute function reject_cancelled_loan_txn();
