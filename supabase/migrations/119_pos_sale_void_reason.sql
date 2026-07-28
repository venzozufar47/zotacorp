-- Void transaksi POS dari halaman Riwayat: alasan + nama kasir wajib.
--
-- Sebelumnya `voided_at` hanya bisa terisi lewat trigger
-- `cashflow_tx_void_pos_sale` (side-effect dari menghapus cashflow tx),
-- jadi tidak ada tempat menyimpan SIAPA yang membatalkan dan KENAPA.
--
-- `voided_by_name` sengaja teks bebas, bukan FK ke profiles: tablet POS
-- login permanen sebagai satu akun (lihat pos_sales.created_by yang ~98%
-- menunjuk akun yang sama), jadi id akun bukan penanda kasir yang berguna.
-- Nama diisi kasir sendiri, default-nya dari jadwal shift di
-- src/lib/pos/cashier-schedule.ts. `voided_by` tetap disimpan sebagai
-- jejak teknis akun mana yang menekan tombol.

alter table public.pos_sales
  add column if not exists void_reason text,
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists voided_by_name text;

comment on column public.pos_sales.void_reason is
  'Alasan pembatalan yang ditulis kasir. Wajib diisi lewat voidPosSale(); '
  'null untuk baris lama yang di-void sebelum fitur ini ada.';

comment on column public.pos_sales.voided_by is
  'Akun yang menekan tombol batal. Jejak teknis — untuk tablet POS yang '
  'login permanen ini menunjuk akun perangkat, bukan orangnya.';

comment on column public.pos_sales.voided_by_name is
  'Nama kasir yang membatalkan, diisi manual (default dari jadwal shift). '
  'Ini penanda orang yang sebenarnya, bukan voided_by.';

-- Sengaja TIDAK menambah index untuk voided_at. Tidak ada query yang
-- memfilter `voided_at IS NOT NULL`: agregat memfilter `IS NULL` (yang
-- justru dikecualikan predikat parsial), dan Riwayat memfilter
-- bank_account_id + sale_date tanpa predikat void sama sekali. Index
-- seperti itu murni beban tulis.
