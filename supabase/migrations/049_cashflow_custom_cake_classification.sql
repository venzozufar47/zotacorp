-- Per-transaction override for custom cake bonus auto-classification.
-- NULL = use the auto rule (source/sender excludes, description filters).
-- TRUE/FALSE = admin manually forced inclusion or exclusion via the
-- verification UI in /admin/payslips/variables?view=bonus-cake.
alter table public.cashflow_transactions
  add column if not exists custom_cake_included boolean;

comment on column public.cashflow_transactions.custom_cake_included is
  'Per-tx override for custom cake bonus calculation. NULL = auto-classify by source_destination + description rules.';
