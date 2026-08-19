-- Nama pelaku diturunkan dari PIN, bukan diketik.
--
-- MASALAHNYA. `pos_sales.voided_by_name` sejauh ini adalah teks bebas
-- yang diketik sendiri oleh orang yang membatalkan (default dari jadwal
-- shift). Artinya kolom yang seluruh gunanya adalah pertanggungjawaban
-- justru diisi oleh pihak yang paling berkepentingan untuk salah
-- mengisinya — dan tidak ada apa pun yang membantahnya.
--
-- SESUDAH migrasi 132, ada sumber yang lebih baik: PIN. Siapa pun yang
-- memasukkan PIN sudah terbukti sebagai salah satu authorizer terdaftar,
-- jadi namanya bisa diambil dari `profiles`, bukan dari keyboard.
--
-- INVARIAN BARU, berlaku untuk baris yang ditulis sejak migrasi ini:
--   nama terisi  <=> ada PIN yang terverifikasi.
-- Rekening yang belum punya authorizer untuk operasi tsb tidak diminta
-- PIN, jadi namanya null. Itu disengaja: lebih baik kosong daripada
-- sebuah nama yang tidak dibuktikan apa pun. Baris lama tetap berisi
-- nama ketikan — dibedakan dari tanggalnya.

comment on column public.pos_sales.voided_by_name is
  'Nama authorizer yang PIN-nya diverifikasi saat pembatalan. Sejak '
  'migrasi 133 TIDAK bisa diketik manual: terisi <=> ada PIN yang lolos. '
  'Null berarti outlet belum punya authorizer sale_void sehingga tidak '
  'ada PIN yang diminta. Baris sebelum 2026-08-19 berisi nama ketikan '
  'kasir. Bandingkan voided_by yang tetap sekadar jejak akun perangkat.';

alter table public.cake_order_payments
  add column if not exists recorded_by_name text;

comment on column public.cake_order_payments.recorded_by_name is
  'Nama authorizer yang PIN-nya diverifikasi saat pelunasan diterima di '
  'kasir POS. Null untuk leg yang ditulis staf cake lewat dashboard '
  '(di sana created_by sudah menunjuk orang yang benar karena mereka '
  'login sebagai diri sendiri) dan untuk outlet tanpa authorizer '
  'cake_pickup. Sama seperti pos_sales.voided_by_name: terisi <=> ada '
  'PIN yang lolos.';
