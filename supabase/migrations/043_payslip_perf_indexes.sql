-- Composite indexes for the hot range-scan paths used by payslip calc.
-- Previously: separate (user_id) + (date) indexes — Postgres picks one
-- and filters in-memory. Composite gives a direct btree slice.
create index if not exists attendance_logs_user_date_idx
  on public.attendance_logs (user_id, date);

create index if not exists extra_work_logs_user_date_idx
  on public.extra_work_logs (user_id, date);

create unique index if not exists payslips_user_month_year_uniq
  on public.payslips (user_id, month, year);

create index if not exists cashflow_tx_date_idx
  on public.cashflow_transactions (transaction_date);

-- Skip-if-clean signature: stores a hash of all inputs that fed the
-- last successful calc. Bulk calc compares fresh signature vs stored;
-- if equal, skip recompute + upsert (cached) for that user.
alter table public.payslips
  add column if not exists inputs_signature text;
