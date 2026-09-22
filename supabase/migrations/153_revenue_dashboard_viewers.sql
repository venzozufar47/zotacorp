-- Karyawan yang admin izinkan melihat kartu "Omzet" (POS + Cake
-- Haengbocake, per hari & bulan berjalan) di beranda mereka sendiri,
-- tanpa harus jadi admin. Pola identik yeobo_booth_admins (063) /
-- cake_finance_admins (150): daftar keanggotaan dikelola admin Zota.
create table if not exists public.revenue_dashboard_viewers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  notes text
);

alter table public.revenue_dashboard_viewers enable row level security;

drop policy if exists revenue_dashboard_viewers_admin_all on public.revenue_dashboard_viewers;
create policy revenue_dashboard_viewers_admin_all
  on public.revenue_dashboard_viewers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists revenue_dashboard_viewers_self_select on public.revenue_dashboard_viewers;
create policy revenue_dashboard_viewers_self_select
  on public.revenue_dashboard_viewers for select to authenticated
  using (user_id = auth.uid());
