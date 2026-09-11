-- Retensi lampiran pesanan kue (cake-order-attachments), 90 hari — pola
-- sama persis dengan 123_media_retention_columns.sql (cashflow-receipts,
-- attendance-selfies) dan cleaning-photos yang sudah lebih dulu jalan.
--
-- Bucket ini sengaja DIKECUALIKAN saat 123 dibuat ("baru 67MB, ditinjau
-- ulang kalau sudah mendekati ratusan MB" — lihat media-retention.ts).
-- Sekarang 43,8MB dan terus tumbuh ~12MB/bulan tanpa batas, satu-satunya
-- bucket besar yang belum tersapu — waktunya ditutup sebelum jadi masalah.
--
-- BEDA STRUKTUR dari cashflow_transactions/attendance_logs: di sana
-- attachment_path adalah SATU kolom nullable di baris yang punya makna
-- bisnis sendiri (transaksi kas, log absensi) lepas dari ada-tidaknya
-- foto. cake_order_attachments TIDAK begitu — satu baris = SATU lampiran,
-- seluruh isinya adalah metadata attachment. Baris tetap TIDAK dihapus
-- (field/mime_type/uploaded_by/created_at tetap jadi jejak "pernah ada
-- lampiran apa, diunggah siapa, kapan" walau filenya sudah dibuang) —
-- storage_path dikosongkan + purged_at diisi, identik filosofinya dengan
-- migrasi 123.

alter table public.cake_order_attachments
  add column if not exists purged_at timestamptz;

comment on column public.cake_order_attachments.purged_at is
  'Kapan file lampiran dihapus sweeper retensi (90 hari). NULL + storage_path terisi = file masih ada. Baris sendiri tidak pernah dihapus — field/mime_type/uploaded_by/created_at tetap jadi jejak "pernah ada lampiran apa".';

create index if not exists cake_order_attachments_retention_idx
  on public.cake_order_attachments (created_at)
  where storage_path is not null;
