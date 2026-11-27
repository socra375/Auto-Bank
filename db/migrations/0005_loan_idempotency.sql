-- 0005_loan_idempotency.sql
-- Lets createLoan dedupe double-submits, including unfunded loans that post no transaction.
-- NULLs stay distinct, so the key is optional (same pattern as transactions).
alter table loans add column idempotency_key text;
alter table loans add constraint loans_user_idempotency_key_uq unique (user_id, idempotency_key);
