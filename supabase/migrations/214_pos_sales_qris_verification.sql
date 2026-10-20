-- Cara pembayaran QRIS diverifikasi di kasir POS:
--   'audio' = ada verifikasi bunyi dari BukuPay → langsung diterima, TANPA foto bukti.
--   'photo' = tidak ada verifikasi bunyi → kasir wajib memotret bukti pembayaran.
-- NULL = penjualan lama (sebelum pilihan ini ada), atau bukan QRIS. Tabel ini sudah punya grant
-- (bukan tabel baru), jadi tidak ada GRANT tambahan.
alter table public.pos_sales
  add column if not exists qris_verification text
  check (qris_verification in ('audio', 'photo'));

comment on column public.pos_sales.qris_verification is
  'QRIS: audio = diverifikasi bunyi BukuPay (tanpa foto); photo = bukti foto wajib. NULL = lama / bukan QRIS.';
