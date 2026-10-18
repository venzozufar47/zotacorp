-- Kalkulator Bonus Tim (PRD-10) — Perjanjian Kerja Lampiran C.
--
-- Kolam akhir = p% × max(0, LK_aktual − LK_dasar) × (poin scorecard / 4).
-- Bagian orang_i = Kolam akhir × (jam_hadir_i / total jam hadir penerima).
--
-- p & LK_dasar dikunci per kuartal (tidak berubah di tengah kuartal, SOP
-- Lampiran C poin 2). LK_aktual dihitung dari `fetchPnL` (lib/cashflow/
-- pnl.ts) — definisi "gross profit" YANG SAMA dipakai dashboard investor,
-- bukan definisi baru yang bisa berbeda dari situ.
--
-- Terkunci ke service-role seperti modul PRD lain sesi ini.

create table public.bonus_parameters (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Pare', 'Semarang')),
  quarter text not null, -- 'YYYY-Q1'..'YYYY-Q4'
  p numeric not null check (p >= 0 and p <= 100),
  lk_dasar numeric not null,
  set_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (branch, quarter)
);

alter table public.bonus_parameters enable row level security;
create policy bonus_parameters_admin_all on public.bonus_parameters
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.bonus_parameters to service_role;

create table public.bonus_runs (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('Pare', 'Semarang')),
  period text not null, -- 'YYYY-MM'
  gross_profit numeric not null,
  lk_dasar numeric not null,
  p numeric not null,
  scorecard_multiplier numeric not null,
  pool numeric not null,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  finalized_by uuid references public.profiles (id),
  finalized_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (branch, period)
);

alter table public.bonus_runs enable row level security;
create policy bonus_runs_admin_all on public.bonus_runs
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.bonus_runs to service_role;

create table public.bonus_run_shares (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.bonus_runs (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  hours numeric not null default 0,
  share numeric not null default 0,
  excluded boolean not null default false,
  excluded_reason text,
  unique (run_id, user_id)
);

create index bonus_run_shares_run_idx on public.bonus_run_shares (run_id);
create index bonus_run_shares_user_idx on public.bonus_run_shares (user_id);

alter table public.bonus_run_shares enable row level security;
create policy bonus_run_shares_admin_all on public.bonus_run_shares
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.bonus_run_shares to service_role;
