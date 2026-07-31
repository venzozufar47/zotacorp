-- Metrik Service Level POS: berapa persen produk ready stock, dirata-rata
-- sepanjang jam buka. Target 100%.
--
-- Empat bagian: (1) jam operasi + saklar per rekening, (2) pengecualian
-- SKU ber-tanggal-berlaku, (3) snapshot harian, (4) kepemilikan metrik.
--
-- JAM OPERASI. Tidak ada konsep jam buka toko di mana pun di skema ini.
-- Ditolak: grid 24 jam (stok memang nol tiap malam sebelum produksi
-- besoknya — itu mengukur "kami tutup malam", bukan service level);
-- hardcode 7–22 seperti default getStockTimeline (tak bisa beda per
-- cabang, padahal Semarang juga dipakai); profiles.work_start_time (itu
-- absensi per orang, tak ada hubungannya dengan jam toko). Default 9–21
-- diambil dari sebaran jam transaksi Pare 30 hari.
--
-- Pola tabel penugasan meniru bank_account_assignees (031); helper RLS
-- security-definer meniru yeobo_booth_admins (063); invarian stok yang
-- dihitung metrik ini didefinisikan di 039.

-- ── 1. Jam operasi + saklar per rekening ────────────────────────────
alter table public.bank_accounts
  add column if not exists service_level_enabled    boolean  not null default false,
  add column if not exists service_level_open_hour  smallint not null default 9,
  add column if not exists service_level_close_hour smallint not null default 21;

do $$ begin
  alter table public.bank_accounts
    add constraint bank_accounts_service_level_hours_check
    check (
      service_level_open_hour  between 0 and 23
      and service_level_close_hour between 1 and 24
      and service_level_open_hour < service_level_close_hour
    );
exception when duplicate_object then null; end $$;

comment on column public.bank_accounts.service_level_enabled is
  'Saklar per outlet. Default false supaya rekening POS baru tidak '
  'diam-diam menumbuhkan kartu metrik, dan supaya kartu di layar kasir '
  'bisa dimatikan tanpa deploy kalau mengganggu antrean.';

comment on column public.bank_accounts.service_level_close_hour is
  'Eksklusif: jam sampel = [open, close). 21 berarti sampel terakhir '
  'jam 20:00 WIB. Boleh 24 untuk toko 24 jam.';

-- ── 2. Pengecualian SKU ber-tanggal-berlaku ─────────────────────────
--
-- Masalahnya nyata dan terukur: di Pare, 8 dari 24 SKU (Mille Crepes 5
-- rasa, Swirl Puff, Banana Strudel 2 ukuran) punya physical_count = 0 di
-- SELURUH 71 opname, nol produksi, dan nol penjualan selama 30 hari.
-- Menu mati yang masih aktif di katalog. Delapan SKU itu sendirian
-- mengunci metrik di maksimum 67%.
--
-- KENAPA TANGGAL BERLAKU, BUKAN SEKADAR MENONAKTIFKAN PRODUK: katalog
-- dibaca APA ADANYA SAAT INI oleh listActiveSkus. Menonaktifkan produk
-- hari ini akan mengeluarkannya dari penyebut untuk SELURUH riwayat,
-- sehingga angka bulan lalu ikut berubah — persis jenis penulisan-ulang
-- riwayat yang membuat metrik tak bisa dipercaya. Dengan `excluded_from`,
-- periode sebelum tanggal itu tetap menghitung SKU tersebut.
--
-- `excluded_until` nullable supaya menu yang dijual lagi bisa dihidupkan
-- tanpa menghapus baris (menghapus = menulis ulang riwayat). Sampel pada
-- tanggal D dikecualikan bila:
--   excluded_from <= D and (excluded_until is null or D <= excluded_until)
--
-- Granularitas WAJIB per varian, bukan per produk: Mille Crepes punya 5
-- rasa mati sementara Cookies & Cream dan Tiramisu masih laku.
create table if not exists public.pos_service_level_exclusions (
  id              uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  product_id      uuid not null references public.pos_products(id) on delete cascade,
  variant_id      uuid references public.pos_product_variants(id) on delete cascade,
  excluded_from   date not null,
  excluded_until  date,
  reason          text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id) on delete set null,
  check (excluded_until is null or excluded_until >= excluded_from)
);

-- Satu SKU boleh punya beberapa periode pengecualian, tapi tidak boleh
-- dua baris dengan tanggal mulai sama. `coalesce` dipakai karena
-- variant_id nullable dan NULL tidak pernah sama dengan NULL di unique
-- index biasa.
create unique index if not exists pos_service_level_exclusions_sku_from_idx
  on public.pos_service_level_exclusions
     (bank_account_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), excluded_from);

comment on column public.pos_service_level_exclusions.excluded_from is
  'Tanggal WIB mulai berlaku (inklusif). Riwayat sebelum tanggal ini '
  'tetap menghitung SKU tersebut — itu inti desainnya.';

-- ── 3. Snapshot harian ──────────────────────────────────────────────
--
-- Rekonstruksi dari event itu gratis, TAPI riwayatnya bisa berubah di
-- belakang: deleteStockMovement adalah hard delete, setProductStockTracking
-- (false) menghapus permanen movement + opname item produk, dan void
-- terlambat mengubah readiness masa lalu. Snapshot membekukan apa yang
-- benar saat itu.
--
-- Alasan kedua yang menentukan: pemilik metrik yang BUKAN assignee POS
-- tidak bisa membaca pos_products/pos_sales/pos_stock_movements (semua
-- digate is_admin_or_pos_assignee di 035). Menghitung live untuk mereka
-- berarti service-role read di tiap render dashboard.
create table if not exists public.pos_service_level_daily (
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  snapshot_date   date not null,
  open_hour       smallint not null,
  close_hour      smallint not null,
  sample_count    smallint not null,
  tracked_skus    smallint not null,
  ready_sum       integer  not null,
  percent         numeric(5,4),
  had_activity    boolean  not null default true,
  has_baseline    boolean  not null default true,
  partial_opname  boolean  not null default false,
  source          text     not null default 'cron'
                    check (source in ('cron','manual','backfill')),
  detail_json     jsonb,
  computed_at     timestamptz not null default now(),
  primary key (bank_account_id, snapshot_date)
);

comment on column public.pos_service_level_daily.ready_sum is
  'Pembilang mentah (Σ SKU ready lintas sampel). Disimpan bersama '
  'tracked_skus + sample_count, BUKAN cuma percent, supaya rollup '
  'multi-hari bisa di-pool (Σready / Σ(tracked×sample)) alih-alih '
  'merata-ratakan persentase — dan supaya angkanya bisa dicek tangan.';

comment on column public.pos_service_level_daily.has_baseline is
  'False = belum ada opname sebelum jam buka hari itu. percent di-null '
  'dan hari dikeluarkan dari agregat: tanpa baseline semua SKU mulai '
  'dari 0 lalu minus, sehingga terbaca ~0% — itu ketiadaan data yang '
  'dirender sebagai bencana.';

comment on column public.pos_service_level_daily.partial_opname is
  'True = opname hari itu menyebut lebih sedikit SKU daripada yang '
  'dilacak. SKU yang tak disebut ter-reset ke 0 dan terbaca habis. Di '
  'Pare ini terjadi di 57 dari 71 opname, jadi hari tetap dihitung tapi '
  'operator berhak tahu kenapa angkanya turun.';

comment on column public.pos_service_level_daily.source is
  'backfill = dihitung mundur, BUKAN diukur. Penyebut memakai katalog '
  'hari ini, jadi produk yang baru ditambahkan menekan angka historis '
  'secara palsu. Harus dirender berbeda dari baris cron.';

-- Sengaja TIDAK menambah index. PK (bank_account_id, snapshot_date)
-- sudah melayani satu-satunya pola baca — "N hari terakhir untuk satu
-- rekening" — sekaligus jadi target upsert cron. Index lain murni beban
-- tulis (bandingkan penolakan serupa di 119).

-- ── 4. Kepemilikan metrik ───────────────────────────────────────────
create table if not exists public.pos_service_level_owners (
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  assigned_at     timestamptz not null default now(),
  assigned_by     uuid references public.profiles(id) on delete set null,
  primary key (bank_account_id, user_id)
);

-- Index user_id DIBUTUHKAN (tidak seperti tabel snapshot di atas):
-- dashboard karyawan query `where user_id = auth.uid()`, sedangkan kolom
-- pertama PK adalah bank_account_id sehingga index PK tidak menolong.
create index if not exists pos_service_level_owners_user_idx
  on public.pos_service_level_owners (user_id);

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.pos_service_level_owners     enable row level security;
alter table public.pos_service_level_daily      enable row level security;
alter table public.pos_service_level_exclusions enable row level security;

create or replace function public.is_service_level_owner(account_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.pos_service_level_owners
    where bank_account_id = account_id and user_id = auth.uid()
  );
$$;
grant execute on function public.is_service_level_owner(uuid) to authenticated;

drop policy if exists pos_service_level_owners_admin on public.pos_service_level_owners;
create policy pos_service_level_owners_admin
  on public.pos_service_level_owners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Wajib: tanpa ini karyawan tidak bisa membaca baris penugasannya
-- sendiri dan kartunya tidak akan pernah muncul.
drop policy if exists pos_service_level_owners_self_select on public.pos_service_level_owners;
create policy pos_service_level_owners_self_select
  on public.pos_service_level_owners for select to authenticated
  using (user_id = auth.uid());

drop policy if exists pos_service_level_daily_read on public.pos_service_level_daily;
create policy pos_service_level_daily_read
  on public.pos_service_level_daily for select to authenticated
  using (
    public.is_admin_or_pos_assignee(bank_account_id)
    or public.is_service_level_owner(bank_account_id)
  );

drop policy if exists pos_service_level_daily_admin_write on public.pos_service_level_daily;
create policy pos_service_level_daily_admin_write
  on public.pos_service_level_daily for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Cron menulis lewat service-role dan melewati RLS sepenuhnya.

drop policy if exists pos_service_level_exclusions_read on public.pos_service_level_exclusions;
create policy pos_service_level_exclusions_read
  on public.pos_service_level_exclusions for select to authenticated
  using (
    public.is_admin_or_pos_assignee(bank_account_id)
    or public.is_service_level_owner(bank_account_id)
  );

drop policy if exists pos_service_level_exclusions_admin_write on public.pos_service_level_exclusions;
create policy pos_service_level_exclusions_admin_write
  on public.pos_service_level_exclusions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── Celah RLS yang mudah terlewat ───────────────────────────────────
--
-- bank_accounts SELECT digate is_admin_or_pos_assignee(id) sejak 035.
-- Pemilik metrik yang bukan assignee POS TIDAK BISA membaca nama
-- outlet-nya, sehingga kartu di dashboard-nya render kosong TANPA error —
-- gagal senyap yang tak akan ketahuan sampai ada yang mengeluh.
-- Diperlebar dengan alasan yang sama seperti 035 saat membuka tabel ini
-- untuk assignee pos_only: hanya metadata, data kas tetap digate di
-- tabelnya masing-masing.
drop policy if exists bank_accounts_admin_or_pos_assignee_select on public.bank_accounts;
create policy bank_accounts_admin_or_pos_assignee_select
  on public.bank_accounts for select to authenticated
  using (
    public.is_admin_or_pos_assignee(id)
    or public.is_service_level_owner(id)
  );
