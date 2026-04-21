-- Accrual-basis expense period override.
--
-- Some expense categories (Rent, Salaries & Wages) are paid at an
-- arbitrary transaction date but should be *reported* in a specific
-- accounting month. Example: rent for March gets paid Feb 28 or
-- Apr 3 — either way, PnL for March is what we care about.
--
-- These nullable columns let admins override the month bucket used by
-- the PnL aggregation. When both are null (the default), PnL falls back
-- to transaction_date's year/month. Not enforced to only specific
-- categories at the DB level — that's a UI concern; the aggregation
-- simply respects whatever override is set.

alter table public.cashflow_transactions
  add column if not exists effective_period_year int,
  add column if not exists effective_period_month int
    check (effective_period_month is null or effective_period_month between 1 and 12);

-- Either both columns set or both null — partial overrides make no
-- sense and would create ambiguous bucketing.
alter table public.cashflow_transactions
  add constraint cashflow_transactions_effective_period_both_or_none
  check (
    (effective_period_year is null and effective_period_month is null)
    or (effective_period_year is not null and effective_period_month is not null)
  );

create index if not exists cashflow_transactions_effective_period_idx
  on public.cashflow_transactions (effective_period_year, effective_period_month)
  where effective_period_year is not null;
