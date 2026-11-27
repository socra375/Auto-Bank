-- 0002_views.sql
-- Derived data only. Balances and loan status are NEVER stored.

-- balance = opening + SUM(entries). One row per account, so currencies never mix.
create view account_balances as
select a.id                 as account_id,
       a.user_id,
       a.currency,
       a.status,
       a.opening_balance_minor,
       coalesce(sum(e.amount_minor), 0)::bigint                          as entries_minor,
       (a.opening_balance_minor + coalesce(sum(e.amount_minor), 0))::bigint as balance_minor
from accounts a
left join entries e on e.account_id = a.id
group by a.id;

-- Loan progress. A reversal row counts as its original's type, with flipped sign,
-- so voiding a payment restores the outstanding amount.
create view loan_balances as
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
         when l.principal_minor - coalesce(p.principal_paid_minor, 0) = 0 then 'liquidado'
         when l.due_date < (now() at time zone 'America/Santo_Domingo')::date then 'vencido'
         when coalesce(p.principal_paid_minor, 0) > 0 then 'parcial'
         else 'pendiente'
       end as status
from loans l
left join paid p on p.loan_id = l.id;

-- Income/expense classification of entries. Transfers, adjustments and loan principal
-- are deliberately absent. Loan interest is income on a receivable, expense on a payable.
-- amount_minor is positive for the flow, negative for reversals, so SUM nets to zero.
-- Always GROUP BY currency when aggregating.
create view flow_entries as
select e.id as entry_id, e.user_id, e.account_id, e.currency, e.date,
       case when e.kind = 'income' or (e.kind = 'loan_interest' and l.direction = 'receivable')
            then 'income' else 'expense' end as flow,
       case when e.kind = 'income' or (e.kind = 'loan_interest' and l.direction = 'receivable')
            then e.amount_minor else -e.amount_minor end as amount_minor
from entries e
join transactions t on t.id = e.transaction_id
left join loans l on l.id = t.loan_id
where e.kind in ('income', 'expense', 'loan_interest');

-- Latest valuation per asset.
create view asset_current_values as
select distinct on (v.asset_id)
       v.asset_id, v.user_id, a.currency, v.value_minor, v.valued_on
from asset_valuations v
join assets a on a.id = v.asset_id
order by v.asset_id, v.valued_on desc, v.seq desc;
