-- Arsip kontrak kerja: menyembunyikan kontrak dari daftar utama admin TANPA
-- menghapusnya. Kontrak tetap utuh (isi, tanda tangan, PDF, nomor surat) dan
-- tetap dihitung dalam penomoran urut; bisa dikembalikan kapan saja.
--
-- Hanya mengatur tampilan di halaman admin Kontrak Kerja. Sisi karyawan tidak
-- berubah (karyawan tetap bisa melihat / menandatangani kontraknya), begitu
-- pula status tanda tangan — kolom ini tidak menyentuh status/version.
--
-- NULL = aktif (tampil di daftar utama); terisi = diarsipkan pada waktu itu.

alter table public.employment_contracts
  add column if not exists archived_at timestamptz;

comment on column public.employment_contracts.archived_at is
  'Waktu kontrak diarsipkan admin (disembunyikan dari daftar utama). NULL = aktif. Tidak memengaruhi status tanda tangan / sisi karyawan.';
