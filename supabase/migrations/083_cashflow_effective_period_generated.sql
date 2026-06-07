-- Performance: bound PnL queries to the requested period at the DB level.
--
-- PnL aggregators bucket each transaction by its EFFECTIVE period =
-- COALESCE((effective_period_year, effective_period_month), month-of(transaction_date)).
-- Previously the query pulled a BU's entire transaction history and filtered
-- that coalesced period in JS — an unbounded full-history scan that grows with
-- the ledger.
--
-- This adds a STORED GENERATED column materializing that coalesced period as a
-- date (first-of-month), plus an index, so the aggregators can push a
-- `.gte/.lt("effective_period", ...)` range bound into Postgres.
--
-- make_date() is STRICT: if either effective_period_year or _month is NULL it
-- returns NULL, so COALESCE safely falls through to the transaction_date month.
-- (transaction_date is NOT NULL.)

-- NOTE: the expression must be IMMUTABLE for a generated column. date_trunc()
-- on a date resolves to the non-immutable timestamptz overload, so build the
-- first-of-month with make_date()+extract() (both immutable) on both branches.
alter table public.cashflow_transactions
  add column effective_period date
  generated always as (
    coalesce(
      make_date(effective_period_year, effective_period_month, 1),
      make_date(
        extract(year from transaction_date)::int,
        extract(month from transaction_date)::int,
        1
      )
    )
  ) stored;

create index if not exists cashflow_transactions_stmt_effperiod_idx
  on public.cashflow_transactions (statement_id, effective_period);
