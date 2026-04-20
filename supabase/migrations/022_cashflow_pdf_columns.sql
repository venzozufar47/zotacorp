-- Structured columns that mirror the rekening koran PDF layout so the
-- editor table renders the same shape the admin sees in the original
-- statement. Previously everything was smash-merged into `description`,
-- which was fine as a preview but terrible for downstream processing
-- (categorization, reporting, lookup).
--
-- All three columns are nullable so existing rows don't break and the
-- parser can progressively populate them as heuristics improve.

alter table public.cashflow_transactions
  add column if not exists transaction_time text,
  add column if not exists source_destination text,
  add column if not exists transaction_details text;
