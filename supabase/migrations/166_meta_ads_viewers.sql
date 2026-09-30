-- Karyawan yang admin izinkan melihat dashboard Meta Ads Insights
-- (/admin/ads) tanpa harus jadi admin. Pola identik yeobo_booth_admins
-- (063) / revenue_dashboard_viewers (153): daftar keanggotaan dikelola
-- admin Zota.
create table if not exists public.meta_ads_viewers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  notes text
);

alter table public.meta_ads_viewers enable row level security;

drop policy if exists meta_ads_viewers_admin_all on public.meta_ads_viewers;
create policy meta_ads_viewers_admin_all
  on public.meta_ads_viewers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists meta_ads_viewers_self_select on public.meta_ads_viewers;
create policy meta_ads_viewers_self_select
  on public.meta_ads_viewers for select to authenticated
  using (user_id = auth.uid());
