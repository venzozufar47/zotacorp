-- Social Media Insights & KPI — Instagram + TikTok.
--
-- Kenapa ada: penilaian content creator & social media manager selama ini
-- bertumpu pada kesan, bukan angka. Fitur ini menarik insights dari akun brand
-- sendiri secara otomatis, menyimpannya sebagai riwayat panjang, lalu
-- menyajikannya dalam rentang waktu yang bisa diatur sebagai dasar KPI.
--
-- Tiga kenyataan platform yang MEMBENTUK skema ini (bukan preferensi desain):
--
--   1. Meta hanya menyimpan insights level akun ±90 hari. Riwayat lebih panjang
--      tidak bisa diminta ulang — hanya ada kalau kita snapshot sendiri. Itu
--      sebabnya social_account_metrics wajib, bukan pelengkap.
--   2. Angka sebuah postingan terus bergerak setelah publish. Satu angka
--      "final" tidak adil untuk membandingkan kreator (yang posting kemarin
--      pasti kalah dari yang posting bulan lalu). social_post_metrics menyimpan
--      DERET WAKTU per postingan supaya "views 24 jam pertama" bisa dihitung.
--   3. TikTok Display API tidak menyediakan reach, saves, watch time, maupun
--      demografi. Karena itu SEMUA kolom metrik nullable dan NULL berarti
--      "provider tidak menyediakan" — jangan pernah menulis 0, karena 0 adalah
--      klaim bahwa nilainya nol dan itu akan meracuni rata-rata.
--
-- Sumber data sengaja dijadikan plug-in: kolom social_accounts.provider memilih
-- adapter per akun, sehingga pindah vendor atau menambah platform kelak adalah
-- perubahan satu baris data, bukan pembongkaran skema.
--
-- Konvensi mengikuti 109_sim_cards.sql: create table if not exists, soft delete
-- lewat is_active (arsip, bukan hard delete), index if not exists, trigger touch
-- updated_at bersama, RLS aktif, tiap policy drop-then-create agar migration
-- bisa dijalankan ulang, penamaan <tabel>_<audiens>_<verb>.

-- Trigger touch updated_at bersama untuk tabel-tabel social.
create or replace function public.social_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- 1. Registri akun yang dipantau -----------------------------------------
create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  -- FK by id, bukan teks: unit bisnis pernah di-rename (Haengbocake ->
  -- Haengbocake Pare/Semarang) dan riwayat KPI tidak boleh ikut putus.
  business_unit_id uuid not null
    references public.business_units(id) on delete restrict,
  platform text not null
    check (platform in ('instagram','tiktok','youtube','facebook')),
  handle text not null,                              -- tanpa "@"
  display_name text,
  external_account_id text,                          -- IG user id / TikTok open_id
  -- Saklar adapter. 'manual' inert (tidak memanggil apa pun) sehingga seluruh
  -- UI bisa dipakai sebelum app review Meta/TikTok lolos.
  provider text not null default 'manual'
    check (provider in ('manual','instagram_graph','tiktok_display',
                        'ayrshare','phyllo','scrape_generic')),
  -- Konfigurasi NON-rahasia per akun (ig_user_id, fb_page_id, dst).
  -- Rahasia ada di social_account_credentials — jangan pernah di sini.
  provider_config jsonb not null default '{}'::jsonb,
  -- Atribusi otomatis: postingan mewarisi kreator ini saat pertama terlihat.
  default_creator_id uuid references public.profiles(id) on delete set null,
  manager_id uuid references public.profiles(id) on delete set null,
  sync_enabled boolean not null default true,        -- jeda tanpa mengarsipkan
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  -- Cermin status token (NON-rahasia) supaya UI admin tidak pernah perlu
  -- menyentuh tabel kredensial sama sekali.
  token_expires_at timestamptz,
  token_status text,                                 -- ok | expiring | reauth_required
  token_refresh_failures integer not null default 0,
  follower_count_cache integer,                      -- render daftar tanpa join
  backfill_done_through timestamptz,                 -- watermark tarik historis
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_accounts_bu_idx
  on public.social_accounts(business_unit_id, is_active);
create index if not exists social_accounts_provider_idx
  on public.social_accounts(provider) where sync_enabled and is_active;
create unique index if not exists social_accounts_handle_uidx
  on public.social_accounts(platform, handle) where is_active;
create unique index if not exists social_accounts_external_uidx
  on public.social_accounts(platform, external_account_id)
  where external_account_id is not null;

drop trigger if exists social_accounts_touch on public.social_accounts;
create trigger social_accounts_touch before update on public.social_accounts
  for each row execute function public.social_touch_updated_at();

-- 2. Kredensial — TERISOLASI ---------------------------------------------
-- Tabel terpisah karena social_accounts harus terbaca UI admin, sedangkan
-- token tidak boleh terbaca oleh apa pun yang memegang sesi anon-key.
create table if not exists public.social_account_credentials (
  account_id uuid primary key
    references public.social_accounts(id) on delete cascade,
  access_token text,
  refresh_token text,
  token_type text,
  scopes text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,                    -- TikTok: refresh token 365h
  external_user_id text,
  -- Jahitan enkripsi: 0 = plaintext. Kolom ini memungkinkan AES-GCM
  -- ditambahkan nanti tanpa mengubah skema.
  enc_version integer not null default 0,
  last_refreshed_at timestamptz,
  refresh_failure_count integer not null default 0,
  last_refresh_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists social_account_credentials_touch
  on public.social_account_credentials;
create trigger social_account_credentials_touch
  before update on public.social_account_credentials
  for each row execute function public.social_touch_updated_at();

-- 3. Snapshot metrik level akun (deret waktu harian) ----------------------
-- Penawar retensi 90 hari Meta. Satu baris per akun per hari WIB.
create table if not exists public.social_account_metrics (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null
    references public.social_accounts(id) on delete cascade,
  captured_date date not null,                       -- tanggal WIB
  captured_at timestamptz not null default now(),
  -- Semua nullable: NULL = provider tidak menyediakan, BUKAN nol.
  follower_count integer,
  following_count integer,
  media_count integer,
  likes_total bigint,                                -- TikTok likes_count seumur hidup
  profile_views integer,
  reach integer,
  impressions integer,
  accounts_engaged integer,
  website_clicks integer,
  new_followers integer,
  source text not null,                              -- provider yang menghasilkan
  -- Payload utuh dari provider. Inilah cara "ambil data selengkap-lengkapnya"
  -- benar-benar ditepati: metrik yang belum punya kolom tetap tersimpan dan
  -- bisa dipanen belakangan tanpa kehilangan sejarah.
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, captured_date)                 -- idempoten via upsert
);
create index if not exists social_account_metrics_acc_date_idx
  on public.social_account_metrics(account_id, captured_date desc);

-- 4. Postingan ------------------------------------------------------------
create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null
    references public.social_accounts(id) on delete cascade,
  external_post_id text not null,
  platform text not null,                            -- didenormalisasi: filter murah
  media_type text,                                   -- image | carousel | reel | video
  permalink text,
  thumbnail_url text,
  caption text,
  hashtags text[],                                   -- diurai saat ingest
  duration_seconds numeric(10,2),
  published_at timestamptz not null,
  -- Tanggal WIB. Tanpa ini postingan jam 02:00 WIB jatuh ke tanggal kemarin
  -- saat difilter (preseden: 083_cashflow_effective_period_generated.sql).
  published_date date generated always as
    (((published_at at time zone 'Asia/Jakarta'))::date) stored,
  -- Atribusi. creator_source membedakan warisan otomatis dari koreksi manusia,
  -- sehingga cron tahu baris mana yang HARAM ditimpa.
  creator_id uuid references public.profiles(id) on delete set null,
  creator_source text not null default 'account_default'
    check (creator_source in ('account_default','manual_override')),
  -- Cermin metrik terbaru supaya leaderboard tidak perlu memindai deret waktu.
  views bigint,
  plays bigint,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  reach integer,
  impressions integer,
  engagement_rate numeric(8,4),
  metrics_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  -- Postingan yang dihapus dari platform TIDAK dihapus di sini: riwayat KPI
  -- harus selamat walau kontennya sudah ditarik.
  is_deleted boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, external_post_id)              -- kunci upsert
);
create index if not exists social_posts_acc_pub_idx
  on public.social_posts(account_id, published_at desc);
create index if not exists social_posts_creator_idx
  on public.social_posts(creator_id, published_at desc);
create index if not exists social_posts_pubdate_idx
  on public.social_posts(published_date);
create index if not exists social_posts_live_idx
  on public.social_posts(account_id, published_at desc) where not is_deleted;

drop trigger if exists social_posts_touch on public.social_posts;
create trigger social_posts_touch before update on public.social_posts
  for each row execute function public.social_touch_updated_at();

-- 5. Deret waktu metrik per postingan — TABEL INTI ------------------------
-- Angka postingan terus naik setelah publish, jadi membandingkan kreator dari
-- satu angka akhir selalu memihak postingan yang lebih tua. Dengan menyimpan
-- beberapa titik waktu, "views 24 jam pertama" menjadi pembanding yang netral
-- terhadap umur postingan.
--
-- CARA MEMBACA (penting): "views 24 jam pertama" dihitung dari age_minutes —
-- ambil baris dengan age_minutes terbesar yang <= 1440 — BUKAN dari label slot.
-- Cron berjalan tiap 15 menit sehingga slot 'h1' sebenarnya tertangkap pada
-- usia 60-75 menit; age_minutes yang menjaga perbandingan tetap jujur.
create table if not exists public.social_post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  captured_at timestamptz not null default now(),
  age_minutes integer not null,                      -- captured_at - published_at
  -- h1..d30 untuk tonggak awal, lalu 'day:YYYY-MM-DD' untuk ekor panjang,
  -- 'manual:YYYY-MM-DD' untuk input manual.
  slot text not null,
  views bigint,
  plays bigint,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  reach integer,
  impressions integer,
  profile_visits integer,
  follows integer,
  watch_time_seconds bigint,
  avg_watch_time_seconds numeric(10,2),
  full_video_watched_rate numeric(6,4),
  source text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- Menjalankan cron tiga kali beruntun menghasilkan baris yang sama persis.
  unique (post_id, slot)
);
create index if not exists social_post_metrics_post_cap_idx
  on public.social_post_metrics(post_id, captured_at desc);
create index if not exists social_post_metrics_post_age_idx
  on public.social_post_metrics(post_id, age_minutes);

-- 6. Log sync — audit sekaligus buku kas rate limit -----------------------
-- api_calls bukan sekadar statistik: inilah sumber kebenaran untuk mematuhi
-- batas Meta 200 panggilan/akun/jam. Panggilan yang GAGAL pun tetap dicatat,
-- karena Meta tetap memotong kuota untuk panggilan yang error.
create table if not exists public.social_sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('accounts','posts_discover','posts_metrics',
                    'token_refresh','backfill','manual')),
  account_id uuid references public.social_accounts(id) on delete cascade,
  provider text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running','ok','partial','error','skipped')),
  api_calls integer not null default 0,
  posts_seen integer not null default 0,
  posts_upserted integer not null default 0,
  metric_rows integer not null default 0,
  error_reason text,                                 -- nilai union verbatim
  error_detail text,                                 -- SUDAH diredaksi
  summary jsonb not null default '{}'::jsonb
);
create index if not exists social_sync_runs_started_idx
  on public.social_sync_runs(started_at desc);
create index if not exists social_sync_runs_acc_idx
  on public.social_sync_runs(account_id, started_at desc);
create index if not exists social_sync_runs_budget_idx
  on public.social_sync_runs(account_id, started_at desc)
  where account_id is not null;

-- 7. Target KPI — tanpa mengunci metrik -----------------------------------
-- Owner belum memutuskan metrik mana yang jadi KPI, jadi metric_key sengaja
-- teks bebas yang divalidasi zod terhadap registry TS di
-- src/lib/social/metrics.ts. Menambah metrik = satu baris TypeScript, bukan
-- migration baru. weight menyiapkan skor gabungan tanpa perubahan skema.
create table if not exists public.social_kpi_targets (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('creator','account','business_unit')),
  creator_id uuid references public.profiles(id) on delete cascade,
  account_id uuid references public.social_accounts(id) on delete cascade,
  business_unit_id uuid references public.business_units(id) on delete cascade,
  metric_key text not null,
  period_type text not null default 'monthly'
    check (period_type in ('monthly','weekly','custom')),
  period_start date not null,
  period_end date,
  target_value numeric(16,4) not null,
  comparator text not null default 'gte' check (comparator in ('gte','lte')),
  weight numeric(6,2) not null default 1,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Sentinel coalesce: tanpa ini kolom scope yang NULL lolos dari unique
-- (NULL != NULL di Postgres) sehingga target ganda bisa tercipta diam-diam.
create unique index if not exists social_kpi_targets_uidx
  on public.social_kpi_targets (
    scope,
    coalesce(creator_id,       '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(account_id,       '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(business_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    metric_key, period_start
  ) where is_active;

drop trigger if exists social_kpi_targets_touch on public.social_kpi_targets;
create trigger social_kpi_targets_touch before update on public.social_kpi_targets
  for each row execute function public.social_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helper RLS
-- ---------------------------------------------------------------------------
-- Kreator/manajer boleh melihat akunnya sendiri. Dikirim sekarang supaya
-- halaman swalayan kreator kelak murni pekerjaan UI. Meniru is_sim_pic (109).
create or replace function public.is_social_account_member(account uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.social_accounts a
    where a.id = account
      and (a.default_creator_id = auth.uid() or a.manager_id = auth.uid())
  );
$$;
grant execute on function public.is_social_account_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.social_accounts enable row level security;
alter table public.social_account_credentials enable row level security;
alter table public.social_account_metrics enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_post_metrics enable row level security;
alter table public.social_sync_runs enable row level security;
alter table public.social_kpi_targets enable row level security;

drop policy if exists social_accounts_admin_all on public.social_accounts;
create policy social_accounts_admin_all on public.social_accounts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists social_accounts_member_select on public.social_accounts;
create policy social_accounts_member_select on public.social_accounts
  for select to authenticated
  using (default_creator_id = auth.uid() or manager_id = auth.uid());

-- !!! social_account_credentials SENGAJA TIDAK PUNYA POLICY SAMA SEKALI. !!!
-- RLS aktif + nol policy = nol baris untuk SEMUA peran authenticated,
-- termasuk admin. Token hanya terbaca lewat service-role (createAdminClient)
-- di kode server. Ini LEBIH ketat dari preseden 027_bank_account_pdf_password
-- (yang admin-readable), karena token OAuth memberi akses tulis ke akun sosial
-- perusahaan sedangkan password PDF hanya membuka berkas.
-- JANGAN menambahkan policy di migration berikutnya dengan niat "memperbaiki";
-- ketiadaan policy di sini adalah fiturnya, bukan kelalaian.

drop policy if exists social_account_metrics_admin_all on public.social_account_metrics;
create policy social_account_metrics_admin_all on public.social_account_metrics
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists social_account_metrics_member_select on public.social_account_metrics;
create policy social_account_metrics_member_select on public.social_account_metrics
  for select to authenticated using (public.is_social_account_member(account_id));

drop policy if exists social_posts_admin_all on public.social_posts;
create policy social_posts_admin_all on public.social_posts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists social_posts_member_select on public.social_posts;
create policy social_posts_member_select on public.social_posts
  for select to authenticated
  using (public.is_social_account_member(account_id) or creator_id = auth.uid());

drop policy if exists social_post_metrics_admin_all on public.social_post_metrics;
create policy social_post_metrics_admin_all on public.social_post_metrics
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists social_post_metrics_member_select on public.social_post_metrics;
create policy social_post_metrics_member_select on public.social_post_metrics
  for select to authenticated
  using (exists (
    select 1 from public.social_posts p
    where p.id = post_id
      and (public.is_social_account_member(p.account_id) or p.creator_id = auth.uid())
  ));

drop policy if exists social_sync_runs_admin_all on public.social_sync_runs;
create policy social_sync_runs_admin_all on public.social_sync_runs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists social_kpi_targets_admin_all on public.social_kpi_targets;
create policy social_kpi_targets_admin_all on public.social_kpi_targets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists social_kpi_targets_self_select on public.social_kpi_targets;
create policy social_kpi_targets_self_select on public.social_kpi_targets
  for select to authenticated using (creator_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime — strip kesehatan sync di UI admin ikut hidup tanpa polling.
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.social_accounts;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.social_sync_runs;
exception when duplicate_object then null; end $$;
