-- Adds a `branch` column to cashflow transactions so each row can be
-- tagged to the business unit's physical cabang (e.g. Haengbocake's
-- Semarang vs Pare outlets). The editor UI shows a dropdown scoped to
-- the BU's registered branches; saved rows keep whatever value was
-- persisted even if the list later changes.

alter table public.cashflow_transactions
  add column if not exists branch text;
