-- Ambang warna Scorecard Cabang yang bisa diatur owner (halaman Service Level): Waste (≤ hijau, ≤ kuning, selebihnya merah)
-- dan Service level (≥ hijau, ≥ kuning, di bawahnya merah), dalam persen. Nilai awal = angka yang sebelumnya konstanta di kode.
-- Dibaca server (service-role) saat menghitung scorecard & kalkulator bonus; RLS hanya admin sebagai jaring kedua.
create table if not exists public.branch_scorecard_thresholds (
  metric text primary key check (metric in ('waste', 'service_level')),
  green_bound numeric not null check (green_bound >= 0 and green_bound <= 100),
  yellow_bound numeric not null check (yellow_bound >= 0 and yellow_bound <= 100),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- waste: kecil itu baik (hijau < kuning); service level: besar itu baik (kuning < hijau).
  check ((metric = 'waste' and green_bound < yellow_bound) or (metric = 'service_level' and yellow_bound < green_bound))
);

insert into public.branch_scorecard_thresholds (metric, green_bound, yellow_bound)
values ('waste', 3, 5), ('service_level', 80, 70)
on conflict (metric) do nothing;

alter table public.branch_scorecard_thresholds enable row level security;
drop policy if exists bst_admin_all on public.branch_scorecard_thresholds;
create policy bst_admin_all on public.branch_scorecard_thresholds for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Grant eksplisit (tabel baru: Supabase berhenti memberi grant otomatis mulai 30 Okt 2026).
grant select, insert, update, delete on public.branch_scorecard_thresholds to authenticated, service_role;
