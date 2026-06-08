-- Photo-session counts per Yeobo Space branch, per studio, per package tier,
-- per month. Replaces the unused "Metrik BU" page for Yeobo. Heterogeneous by
-- branch (different studios + package tiers), so studio/package are free text;
-- a leaf row is (branch, studio, package_label, year, month) → sessions.
-- package_label = '' for studio-level leaves with no package tier
-- (Self Photo Studio Besar, Pas Foto, Look Up Studio).

create table if not exists public.yeobo_photo_sessions (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  studio text not null,
  package_label text not null default '',
  period_year int not null,
  period_month int not null check (period_month between 1 and 12),
  sessions int not null check (sessions >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (branch, studio, package_label, period_year, period_month)
);

create index if not exists yeobo_photo_sessions_branch_period_idx
  on public.yeobo_photo_sessions (branch, period_year, period_month);

alter table public.yeobo_photo_sessions enable row level security;

-- Admin: full access.
create policy yeobo_photo_sessions_admin_all
  on public.yeobo_photo_sessions
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Investor assigned to Yeobo Space: read-only (BU-scoped, mirrors other
-- Yeobo investor read policies).
create policy yeobo_photo_sessions_investor_select
  on public.yeobo_photo_sessions
  for select to authenticated
  using (is_investor_for_business_unit('Yeobo Space'));
