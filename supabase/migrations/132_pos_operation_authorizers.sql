-- Otorisasi POS: dari SATU penanggung jawab per operasi menjadi BANYAK,
-- dan dari tiga operasi menjadi lima.
--
-- KENAPA BANYAK. Bentuk lama menyimpan satu uuid per operasi langsung di
-- `bank_accounts` (production/withdrawal/opname_authorizer_id). Satu orang
-- per operasi berarti operasi itu MATI ketika dia libur, sakit, atau
-- resign — dan satu-satunya jalan keluar adalah admin mengedit rekening
-- dari jauh saat customer sedang berdiri di konter. Tabel penugasan
-- membuat "siapa saja dari daftar ini" menjadi ekspresi yang wajar.
--
-- KENAPA TABEL, BUKAN uuid[]. Array tidak bisa punya foreign key, jadi
-- karyawan yang dihapus meninggalkan uuid hantu yang diam-diam menyusut
-- daftar authorizer tanpa jejak. `on delete cascade` di sini menghapus
-- barisnya secara eksplisit.
--
-- DUA OPERASI BARU. `cake_pickup` (serah terima custom cake di kasir) dan
-- `sale_void` (pembatalan transaksi dari Riwayat) sama-sama memindahkan
-- barang atau uang keluar tanpa penjualan tandingan — persis kelas risiko
-- yang sama dengan penarikan stok, yang sejak awal sudah ber-PIN.
--
-- Pola tabel meniru pos_service_level_owners (122); helper RLS
-- `is_admin_or_pos_assignee` berasal dari 035.

create table if not exists public.pos_operation_authorizers (
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  operation       text not null
                    check (operation in (
                      'production', 'withdrawal', 'opname',
                      'cake_pickup', 'sale_void'
                    )),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  assigned_at     timestamptz not null default now(),
  assigned_by     uuid references public.profiles(id) on delete set null,
  primary key (bank_account_id, operation, user_id)
);

comment on table public.pos_operation_authorizers is
  'Siapa saja yang PIN-nya diterima untuk satu operasi POS di satu '
  'rekening. NOL baris = operasi tidak butuh otorisasi sama sekali; '
  'itu default-nya dan sengaja dipertahankan supaya rekening POS baru '
  'tidak langsung terkunci.';

comment on column public.pos_operation_authorizers.operation is
  'production | withdrawal | opname | cake_pickup | sale_void. Penjualan '
  'biasa TIDAK ada di daftar: memaksa PIN di tiap transaksi akan '
  'melumpuhkan antrean, dan penjualan sudah punya jejak uangnya sendiri.';

-- PK berawalan bank_account_id sudah melayani baca "authorizer rekening
-- X operasi Y". Index user_id dibutuhkan terpisah untuk arah sebaliknya:
-- pembersihan saat akses seseorang dicabut dari sebuah rekening.
create index if not exists pos_operation_authorizers_user_idx
  on public.pos_operation_authorizers (user_id);

-- ── Backfill dari tiga kolom lama ───────────────────────────────────
--
-- `on conflict do nothing` supaya migrasi tetap idempoten kalau dijalankan
-- ulang. Kolom lama SENGAJA belum di-drop: selama jendela antara migrasi
-- ini dan deploy kode baru, kode lama masih membacanya — dan kalau kolom
-- itu hilang, `verifyAuthorization` versi lama membaca null lalu
-- menyimpulkan "tidak ada authorizer", yaitu GAGAL-TERBUKA di jalur
-- keamanan. Drop-nya menyusul di migrasi terpisah setelah deploy.
insert into public.pos_operation_authorizers (bank_account_id, operation, user_id)
select id, 'production', production_authorizer_id
  from public.bank_accounts where production_authorizer_id is not null
union all
select id, 'withdrawal', withdrawal_authorizer_id
  from public.bank_accounts where withdrawal_authorizer_id is not null
union all
select id, 'opname', opname_authorizer_id
  from public.bank_accounts where opname_authorizer_id is not null
on conflict do nothing;

comment on column public.bank_accounts.production_authorizer_id is
  'USANG per migrasi 132 — sudah disalin ke pos_operation_authorizers. '
  'Tidak dibaca kode mana pun; dijadwalkan di-drop.';
comment on column public.bank_accounts.withdrawal_authorizer_id is
  'USANG per migrasi 132 — lihat production_authorizer_id.';
comment on column public.bank_accounts.opname_authorizer_id is
  'USANG per migrasi 132 — lihat production_authorizer_id.';

-- ── RLS ─────────────────────────────────────────────────────────────
--
-- Verifikasi PIN sendiri berjalan lewat service-role (perlu membaca
-- `profiles.pos_pin_hash` orang LAIN, yang RLS profiles memang tutup —
-- lihat catatan di src/lib/pos/authorizers.ts). Policy di sini melayani
-- kartu admin dan pembacaan biasa, bukan jalur verifikasi.
alter table public.pos_operation_authorizers enable row level security;

drop policy if exists pos_operation_authorizers_admin on public.pos_operation_authorizers;
create policy pos_operation_authorizers_admin
  on public.pos_operation_authorizers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists pos_operation_authorizers_pos_select on public.pos_operation_authorizers;
create policy pos_operation_authorizers_pos_select
  on public.pos_operation_authorizers for select to authenticated
  using (public.is_admin_or_pos_assignee(bank_account_id));
