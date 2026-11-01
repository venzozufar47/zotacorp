-- Ambang scorecard khusus satu cabang pada satu bulan (menimpa ambang umum di branch_scorecard_thresholds untuk metrik yang
-- disebut). Dipakai kartu scorecard dan Kalkulator Bonus saat menghitung bulan itu, jadi hasil bulan itu tetap dinilai dengan
-- target yang berlaku PADA BULAN TERSEBUT walau ambang umum diubah belakangan.
--
-- Isi awal: Service level Pare Oktober 2026 — hijau ≥ 80%, kuning 70% sampai < 80% (ditetapkan owner untuk bulan itu).
create table if not exists public.branch_scorecard_threshold_overrides (
  branch text not null check (branch in ('Pare', 'Semarang')),
  month date not null check (extract(day from month) = 1),
  metric text not null check (metric in ('waste', 'service_level', 'feedback')),
  green_bound numeric not null,
  yellow_bound numeric not null,
  note text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (branch, month, metric),
  -- waste: kecil itu baik (hijau < kuning); service level & feedback: besar itu baik (kuning < hijau).
  check ((metric = 'waste' and green_bound < yellow_bound) or (metric <> 'waste' and yellow_bound < green_bound))
);

alter table public.branch_scorecard_threshold_overrides enable row level security;
drop policy if exists bsto_admin_all on public.branch_scorecard_threshold_overrides;
create policy bsto_admin_all on public.branch_scorecard_threshold_overrides for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Grant eksplisit (tabel baru: Supabase berhenti memberi grant otomatis mulai 30 Okt 2026).
grant select, insert, update, delete on public.branch_scorecard_threshold_overrides to authenticated, service_role;

insert into public.branch_scorecard_threshold_overrides (branch, month, metric, green_bound, yellow_bound, note)
values ('Pare', '2026-10-01', 'service_level', 80, 70, 'Target khusus Oktober 2026: hijau ≥ 80%, kuning 70–80%')
on conflict (branch, month, metric) do nothing;
