-- Per-month × per-category split of Pusat branch amounts into the
-- operating branches (Semarang + Pare). Pusat isn't an operating
-- entity — every rupiah tagged branch='Pusat' must eventually get
-- re-attributed to an operating branch for the PnL report to stay
-- accurate. Admin inputs the split via the PnL page's allocation
-- editor.
--
-- Constraint (enforced in the server action, not SQL): for each
-- (bu, year, month, side, category), semarang_amount + pare_amount
-- must equal the total Pusat amount from cashflow_transactions for
-- that same bucket. Until that matches, the row counts as
-- "unbalanced" in the PnL UI and the Pusat totals are EXCLUDED from
-- branch PnL numbers (with a visible warning).

create table public.cashflow_pusat_allocations (
  id uuid primary key default uuid_generate_v4(),
  business_unit text not null,
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  side text not null check (side in ('credit','debit')),
  category text not null,
  semarang_amount numeric(16,2) not null default 0,
  pare_amount numeric(16,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit, period_year, period_month, side, category)
);

create index cashflow_pusat_allocations_bu_period_idx
  on public.cashflow_pusat_allocations (business_unit, period_year, period_month);

alter table public.cashflow_pusat_allocations enable row level security;
create policy cashflow_pusat_allocations_admin_select
  on public.cashflow_pusat_allocations for select to authenticated using (public.is_admin());
create policy cashflow_pusat_allocations_admin_write
  on public.cashflow_pusat_allocations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Reuse the generic updated_at touch helper defined in migration 023.
create trigger cashflow_pusat_allocations_updated_at
  before update on public.cashflow_pusat_allocations
  for each row execute function public.cashflow_rules_touch_updated_at();
