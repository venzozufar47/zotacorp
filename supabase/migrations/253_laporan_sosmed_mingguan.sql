-- Laporan Sosmed Mingguan + Scorecard Sosmed (empat metrik) — menggantikan seluruh modul insights lama.
--
-- Modul lama (118 insights otomatis + 251 scorecard dengan input proses) tidak pernah terpakai dan semua tabelnya
-- kosong (4 akun & 16 baris ambang awal saja), jadi dibuang. Penggantinya sengaja sederhana: dua orang (Intaning,
-- Hasna) mengisi laporan mingguan per akun Instagram & TikTok tiga brand, dan scorecard bulanan dihitung dari situ.
--
--   Performance : views, viewers, interaksi (like+komentar+share+simpan, untuk engagement rate)
--   Audience    : followers (akhir minggu), follows, unfollows  (net follows = follows − unfollows)
--   Routine     : jumlah post, reels, stories
--
-- Scorecard (per brand, bulanan): Reach (viewers), Omset (dari laporan keuangan/POS), % pertumbuhan followers,
-- % engagement rate. Target + ambang hijau/kuning/merah berversi (wajib alasan).
-- Semua TULIS lewat server action (service_role); authenticated cuma boleh SELECT dan itu tertahan RLS is_admin().

drop table if exists public.social_sync_runs, public.social_post_metrics, public.social_posts,
  public.social_account_metrics, public.social_account_credentials, public.social_kpi_targets,
  public.social_scorecard_weekly, public.social_scorecard_config, public.social_accounts cascade;
drop function if exists public.social_touch_updated_at();

create table public.social_brands (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  sort_order integer not null default 0
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.social_brands (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok')),
  handle text not null,
  is_active boolean not null default true,
  unique (brand_id, platform)
);

create table public.social_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts (id) on delete cascade,
  -- Senin awal minggu (ISO).
  week_start date not null check (extract(isodow from week_start) = 1),
  views integer not null default 0 check (views >= 0),
  viewers integer not null default 0 check (viewers >= 0),
  interactions integer not null default 0 check (interactions >= 0),
  -- Followers pada AKHIR minggu.
  followers integer not null check (followers >= 0),
  follows integer not null default 0 check (follows >= 0),
  unfollows integer not null default 0 check (unfollows >= 0),
  posts integer not null default 0 check (posts >= 0),
  reels integer not null default 0 check (reels >= 0),
  stories integer not null default 0 check (stories >= 0),
  notes text,
  entered_by uuid references public.profiles (id) on delete set null,
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, week_start)
);
create index social_weekly_reports_week_idx on public.social_weekly_reports (week_start);

-- Siapa yang wajib/boleh mengisi laporan (di luar admin).
create table public.social_report_editors (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.social_scorecard_config (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.social_brands (id) on delete cascade,
  metric_code text not null check (metric_code in ('reach', 'omset', 'followers_growth', 'engagement')),
  -- Target bulanan (null = belum diisi, tidak dinilai). reach: jumlah; omset: rupiah; growth/engagement: persen.
  target_value numeric(18, 4),
  -- Batas status pada pencapaian % terhadap target.
  green_bound numeric(8, 2) not null,
  red_bound numeric(8, 2) not null,
  effective_from date not null,
  changed_by uuid references public.profiles (id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  check (green_bound >= red_bound)
);
create index social_scorecard_config_lookup_idx
  on public.social_scorecard_config (brand_id, metric_code, effective_from desc, created_at desc);

-- ── Data awal ───────────────────────────────────────────────────────────────────────────────────────
insert into public.social_brands (code, label, sort_order) values
  ('haengbocake_idn', 'Haengbocake.idn', 1),
  ('haengbo_corner', 'haengbo.corner', 2),
  ('yeobospace_id', 'yeobospace.id', 3);

insert into public.social_accounts (brand_id, platform, handle)
select b.id, p.platform, b.code_handle
from (
  select id, case code when 'haengbocake_idn' then 'haengbocake.idn' when 'haengbo_corner' then 'haengbo.corner' else 'yeobospace.id' end as code_handle
  from public.social_brands
) b
cross join (values ('instagram'), ('tiktok')) as p(platform);

-- Pengisi laporan: Ana Intaning dan Hasna.
insert into public.social_report_editors (user_id)
select id from public.profiles
where id in ('83226591-b893-47b9-82a1-520f2de26f1f', 'deb8cec3-d331-40e4-be5f-d34badf47ac5');

insert into public.social_scorecard_config (brand_id, metric_code, target_value, green_bound, red_bound, effective_from, reason)
select b.id, m.code, null, 100, 70, date '2026-01-01', 'Nilai awal'
from public.social_brands b
cross join (values ('reach'), ('omset'), ('followers_growth'), ('engagement')) as m(code);

-- ── RLS + grant (aturan tabel baru Supabase, 30 Okt 2026) ────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['social_brands', 'social_accounts', 'social_weekly_reports', 'social_report_editors', 'social_scorecard_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
