-- Target omzet bulanan per cabang Haengbocake untuk Scorecard Cabang. Omzet scorecard = POS + Custom Cake,
-- jadi targetnya juga untuk total (bukan target harian kasir di bank_accounts.daily_revenue_target, yang POS-saja
-- dan tetap dipakai layar kasir). Kosong = "Target belum diatur".
create table public.scorecard_branch_targets (
  branch text primary key check (branch in ('Pare', 'Semarang')),
  monthly_omzet_target numeric(14, 0) check (monthly_omzet_target is null or monthly_omzet_target > 0),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.scorecard_branch_targets (branch) values ('Pare'), ('Semarang');

alter table public.scorecard_branch_targets enable row level security;
create policy scorecard_branch_targets_admin_all on public.scorecard_branch_targets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.scorecard_branch_targets to authenticated;
grant select, insert, update, delete on public.scorecard_branch_targets to service_role;
revoke all on public.scorecard_branch_targets from anon;
