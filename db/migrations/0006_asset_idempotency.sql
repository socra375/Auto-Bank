-- 0006_asset_idempotency.sql
-- Lets createAsset / addValuation dedupe double-submits. NULLs stay distinct, so the key is optional.
-- (Adding a column does not touch the append-only trigger, which only fires on UPDATE/DELETE of rows.)
alter table assets add column idempotency_key text;
alter table assets add constraint assets_user_idempotency_key_uq unique (user_id, idempotency_key);
alter table asset_valuations add column idempotency_key text;
alter table asset_valuations add constraint asset_valuations_user_idempotency_key_uq unique (user_id, idempotency_key);
