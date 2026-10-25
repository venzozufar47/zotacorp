-- Scorecard Unit Bisnis (PRD 25 Okt 2026), Fase 1: tabel inti, RLS superadmin (profiles.role='admin'), seed unit, modal, metrik, ambang.
-- Pembacaan/penulisan hanya lewat server action (service_role); `authenticated` hanya boleh SELECT dan itu pun tertahan RLS is_admin().

-- ── Unit yang dinilai (data, bukan kode) ────────────────────────────────────────────────────────────────────────
create table if not exists public.scorecard_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  brand text not null,
  unit_type text not null check (unit_type in ('cabang_bakery', 'cabang_studio')),
  -- Sumber laba-rugi: 'haengbocake' (fetchPnL, kunci = pnl_branch) atau 'yeobo' (fetchYeoboPnL, kunci = pnl_branch).
  pnl_source text not null check (pnl_source in ('haengbocake', 'yeobo')),
  pnl_branch text not null,
  -- bank_accounts.default_branch kasir POS (Haengbocake) dan merek di modul costing ("Haengbocake Pare").
  pos_branch text,
  costing_brand text,
  -- yeobo.branches.id (Yeobo Space).
  yeobo_branch_id text,
  opened_at date,
  -- Unit dinilai "Ramp-up" selama awal periode < ramp_up_until.
  ramp_up_until date,
  -- Jam sibuk S2: akhir pekan seharian + hari kerja pada rentang menit ini (default 16:00-21:00).
  peak_weekday_start_min integer not null default 960,
  peak_weekday_end_min integer not null default 1260,
  peak_weekend_all_day boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- ── Modal awal per unit (untuk payback) ────────────────────────────────────────────────────────────────────────
create table if not exists public.unit_investments (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.scorecard_units(id) on delete cascade,
  description text not null,
  amount_idr numeric(16, 0) not null check (amount_idr >= 0),
  invested_on date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists unit_investments_unit_idx on public.unit_investments (unit_id);

-- ── Status tutup buku per bulan + jejak buka ulang ────────────────────────────────────────────────────────────
create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month) = 1),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  reopen_count integer not null default 0,
  last_reopened_at timestamptz,
  last_reopen_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_period_events (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.accounting_periods(id) on delete cascade,
  action text not null check (action in ('close', 'reopen')),
  reason text,
  warnings jsonb not null default '[]'::jsonb,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists accounting_period_events_period_idx on public.accounting_period_events (period_id, created_at desc);

-- ── Katalog metrik + ambang berversi ────────────────────────────────────────────────────────────────────────────
create table if not exists public.scorecard_metric_definitions (
  code text primary key,
  unit_type text not null check (unit_type in ('cabang_bakery', 'cabang_studio')),
  label text not null,
  formula_note text not null,
  direction text not null check (direction in ('higher_better', 'lower_better')),
  value_unit text not null check (value_unit in ('pct', 'months', 'rating')),
  -- Margin four-wall: penentu utama status unit.
  is_four_wall boolean not null default false,
  -- Operasional (boleh dipratinjau bulan berjalan) vs keuangan (hanya periode tutup buku).
  is_operational boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.scorecard_thresholds (
  id uuid primary key default gen_random_uuid(),
  metric_code text not null references public.scorecard_metric_definitions(code) on delete cascade,
  green_bound numeric(12, 2) not null,
  red_bound numeric(12, 2) not null,
  effective_from date not null,
  changed_by uuid references public.profiles(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists scorecard_thresholds_metric_idx on public.scorecard_thresholds (metric_code, effective_from desc, created_at desc);

-- ── Input manual (rating Google) ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.scorecard_manual_inputs (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.scorecard_units(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  metric_code text not null references public.scorecard_metric_definitions(code) on delete cascade,
  value numeric(12, 2) not null,
  entered_by uuid references public.profiles(id) on delete set null,
  entered_at timestamptz not null default now(),
  unique (unit_id, month, metric_code)
);

-- ── Hasil hitung yang dibekukan (berversi per periode) ──────────────────────────────────────────────────────────
create table if not exists public.scorecard_runs (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.accounting_periods(id) on delete cascade,
  version integer not null,
  computed_by uuid references public.profiles(id) on delete set null,
  computed_at timestamptz not null default now(),
  note text,
  unique (period_id, version)
);

create table if not exists public.scorecard_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.accounting_periods(id) on delete cascade,
  unit_id uuid not null references public.scorecard_units(id) on delete cascade,
  metric_code text not null references public.scorecard_metric_definitions(code),
  value numeric(18, 4),
  -- green | yellow | red | incomplete | not_assessed
  status text not null check (status in ('green', 'yellow', 'red', 'incomplete', 'not_assessed')),
  threshold_id uuid references public.scorecard_thresholds(id),
  -- Pembilang, penyebut, sumber, catatan: setiap angka bisa ditelusuri di UI.
  inputs jsonb not null default '{}'::jsonb,
  version integer not null,
  computed_at timestamptz not null default now(),
  unique (period_id, unit_id, metric_code, version)
);
create index if not exists scorecard_snapshots_period_unit_idx on public.scorecard_snapshots (period_id, unit_id);

create table if not exists public.scorecard_unit_summaries (
  period_id uuid not null references public.accounting_periods(id) on delete cascade,
  unit_id uuid not null references public.scorecard_units(id) on delete cascade,
  version integer not null,
  status text not null check (status in ('green', 'yellow', 'red', 'rampup', 'incomplete', 'no_data')),
  red_metric_count integer not null default 0,
  yellow_metric_count integer not null default 0,
  confirmed_red boolean not null default false,
  computed_at timestamptz not null default now(),
  primary key (period_id, unit_id, version)
);
create index if not exists scorecard_unit_summaries_period_idx on public.scorecard_unit_summaries (period_id, unit_id);

-- ── Kolom keputusan ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.scorecard_actions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.scorecard_units(id) on delete cascade,
  period_id uuid references public.accounting_periods(id) on delete set null,
  metric_code text references public.scorecard_metric_definitions(code) on delete set null,
  decision text not null,
  owner text not null,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done', 'dropped')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scorecard_actions_unit_idx on public.scorecard_actions (unit_id, created_at desc);

create table if not exists public.scorecard_unit_reviews (
  unit_id uuid not null references public.scorecard_units(id) on delete cascade,
  period_id uuid not null references public.accounting_periods(id) on delete cascade,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  primary key (unit_id, period_id)
);

-- ── RLS + GRANT ─────────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'scorecard_units', 'unit_investments', 'accounting_periods', 'accounting_period_events',
    'scorecard_metric_definitions', 'scorecard_thresholds', 'scorecard_manual_inputs',
    'scorecard_runs', 'scorecard_snapshots', 'scorecard_unit_summaries', 'scorecard_actions', 'scorecard_unit_reviews'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- ── Seed: unit ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Pare buka kembali 21 Apr 2026 (ramp-up 3 bulan). Semarang masih renovasi; grand opening rencana pertengahan Nov 2026.
insert into public.scorecard_units
  (code, name, brand, unit_type, pnl_source, pnl_branch, pos_branch, costing_brand, yeobo_branch_id, opened_at, ramp_up_until, sort_order, notes)
values
  ('haengbocake_semarang', 'Haengbocake Semarang', 'Haengbocake', 'cabang_bakery', 'haengbocake', 'Semarang', 'Semarang', 'Haengbocake Semarang', null,
    '2026-11-15', '2027-02-15', 10, 'Renovasi menjadi Haengbocorner Semarang masih berlangsung; grand opening rencana pertengahan Nov 2026. Perbarui tanggal bila berubah.'),
  ('haengbocake_pare', 'Haengbocake Pare', 'Haengbocake', 'cabang_bakery', 'haengbocake', 'Pare', 'Pare', 'Haengbocake Pare', null,
    '2026-04-21', '2026-07-21', 20, 'Buka kembali setelah renovasi (Haengbocorner Pare) 21 Apr 2026.'),
  ('yeobo_tlogosari', 'Yeobo Space Tlogosari', 'Yeobo Space', 'cabang_studio', 'yeobo', 'Tlogosari', null, null, 'tlogosari', '2023-07-01', null, 30, null),
  ('yeobo_tembalang', 'Yeobo Space Tembalang', 'Yeobo Space', 'cabang_studio', 'yeobo', 'Tembalang', null, null, 'tembalang', '2025-01-01', null, 40, null),
  ('yeobo_jebres', 'Yeobo Space Jebres (Solo)', 'Yeobo Space', 'cabang_studio', 'yeobo', 'Jebres', null, null, 'jebres', '2025-12-01', null, 50, null)
on conflict (code) do nothing;

-- Modal awal Yeobo (konfirmasi owner 25 Okt 2026; sama dengan jumlah kontrak investor). Haengbocake belum dihitung.
insert into public.unit_investments (unit_id, description, amount_idr, invested_on)
select u.id, 'Modal awal (konfirmasi owner 25 Okt 2026)', v.amount, v.on_date
from (values
  ('yeobo_tlogosari', 110000000, date '2023-07-01'),
  ('yeobo_tembalang', 200000000, date '2025-01-01'),
  ('yeobo_jebres', 396000000, date '2025-12-01')
) as v(code, amount, on_date)
join public.scorecard_units u on u.code = v.code
where not exists (select 1 from public.unit_investments i where i.unit_id = u.id);

-- ── Seed: metrik (tanpa lapis holding: belum ada entitas Zota Corp) ───────────────────────────────────────────────
insert into public.scorecard_metric_definitions
  (code, unit_type, label, formula_note, direction, value_unit, is_four_wall, is_operational, sort_order)
values
  ('B1', 'cabang_bakery', 'HPP bahan', 'HPP bahan ÷ revenue neto. Bulan sebelum Mei 2026: COGS laporan laba-rugi. Mulai Mei 2026: HPP resep × qty terjual (POS); gerbang kelengkapan HPP 90%.', 'lower_better', 'pct', false, false, 1),
  ('B2', 'cabang_bakery', 'Tenaga kerja', 'Gaji & upah unit (laporan laba-rugi, basis kas) ÷ revenue neto.', 'lower_better', 'pct', false, false, 2),
  ('B3', 'cabang_bakery', 'Sewa', 'Sewa unit (laporan laba-rugi, basis kas) ÷ revenue neto.', 'lower_better', 'pct', false, false, 3),
  ('B4', 'cabang_bakery', 'Margin four-wall', '(Revenue − HPP − tenaga kerja − sewa − biaya operasional langsung − fee bank/platform) ÷ revenue. Tanpa overhead, langganan, pembelian aset, dan dividen.', 'higher_better', 'pct', true, false, 4),
  ('B5', 'cabang_bakery', 'Waste', 'Nilai waste (expired + rusak) pada harga pokok ÷ HPP bahan terjual.', 'lower_better', 'pct', false, true, 5),
  ('B6', 'cabang_bakery', 'Selisih opname', 'Σ|selisih nilai| ÷ Σ nilai stok sistem pada item yang dihitung.', 'lower_better', 'pct', false, true, 6),
  ('S1', 'cabang_studio', 'Utilisasi slot', 'Menit terjual ÷ (menit terjual + menit aktif belum terjual), semua jam.', 'higher_better', 'pct', false, true, 1),
  ('S2', 'cabang_studio', 'Utilisasi jam sibuk', 'Sama dengan S1 pada jam sibuk (akhir pekan seharian + hari kerja 16:00-21:00, bisa diatur per unit).', 'higher_better', 'pct', false, true, 2),
  ('S3', 'cabang_studio', 'Margin four-wall', '(Revenue − COGS − tenaga kerja − sewa − biaya operasional langsung − fee bank/platform) ÷ revenue. Tanpa overhead, pembelian aset, dividen, dan pinjaman owner.', 'higher_better', 'pct', true, false, 3),
  ('S4', 'cabang_studio', 'Sewa', 'Sewa unit (basis kas, pembayaran di muka disebar ke bulan yang dibayar) ÷ revenue.', 'lower_better', 'pct', false, false, 4),
  ('S5', 'cabang_studio', 'Payback modal', 'Modal awal ÷ rata-rata laba four-wall bulanan 3 periode terakhir (rupiah).', 'lower_better', 'months', false, false, 5),
  ('S6', 'cabang_studio', 'Rating Google', 'Rata-rata rating Google bulan itu (input manual).', 'higher_better', 'rating', false, false, 6)
on conflict (code) do nothing;

-- Ambang awal (seed PRD; wajib dikalibrasi). lower_better: hijau ≤ green, merah > red. higher_better: hijau ≥ green, merah < red.
insert into public.scorecard_thresholds (metric_code, green_bound, red_bound, effective_from, reason)
select m.code, v.green_bound, v.red_bound, date '2026-01-01', 'Nilai awal (seed PRD 25 Okt 2026)'
from (values
  ('B1', 35, 42), ('B2', 25, 32), ('B3', 10, 15), ('B4', 15, 8), ('B5', 4, 8), ('B6', 2, 4),
  ('S1', 40, 25), ('S2', 70, 50), ('S3', 30, 20), ('S4', 15, 20), ('S5', 18, 30), ('S6', 4.7, 4.5)
) as v(code, green_bound, red_bound)
join public.scorecard_metric_definitions m on m.code = v.code
where not exists (select 1 from public.scorecard_thresholds t where t.metric_code = m.code);

-- Default privileges Supabase memberi `anon` akses tabel baru; scorecard hanya untuk superadmin, jadi dicabut.
do $$
declare t text;
begin
  foreach t in array array[
    'scorecard_units', 'unit_investments', 'accounting_periods', 'accounting_period_events',
    'scorecard_metric_definitions', 'scorecard_thresholds', 'scorecard_manual_inputs',
    'scorecard_runs', 'scorecard_snapshots', 'scorecard_unit_summaries', 'scorecard_actions', 'scorecard_unit_reviews'
  ] loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
