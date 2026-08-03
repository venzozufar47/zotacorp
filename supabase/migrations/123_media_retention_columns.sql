-- Retensi media: bukti transaksi (cashflow-receipts) + selfie absensi
-- (attendance-selfies) ikut disapu 90 hari, seperti foto kebersihan.
--
-- Kolom penanda WAJIB ada supaya UI bisa membedakan "fotonya sudah
-- kedaluwarsa dan dibuang" dari "memang tidak pernah ada foto". Tanpa itu,
-- mengosongkan path terlihat identik dengan transaksi yang memang tanpa
-- lampiran — dan bukti yang hilang diam-diam adalah hal terakhir yang boleh
-- terjadi pada data keuangan.
--
-- Meniru `cleaning_task_completions.photo_purged_at` (retensi kebersihan yang
-- sudah jalan). Barisnya sendiri TIDAK pernah dihapus: transaksi dan log
-- absensi adalah jejak audit permanen, hanya gambarnya yang kedaluwarsa.

alter table public.cashflow_transactions
  add column if not exists attachment_purged_at timestamptz;

comment on column public.cashflow_transactions.attachment_purged_at is
  'Kapan lampiran bukti dihapus sweeper retensi. NULL + attachment_path NULL = memang tidak ada lampiran.';

alter table public.attendance_logs
  add column if not exists selfie_purged_at timestamptz;

comment on column public.attendance_logs.selfie_purged_at is
  'Kapan selfie absensi dihapus sweeper retensi. NULL + selfie_path NULL = memang tidak ada selfie.';

-- Index parsial: sweeper hanya mencari baris yang MASIH memegang file dan
-- sudah lewat ambang. Tanpa ini query harian memindai seluruh tabel — dan
-- cashflow_transactions sudah 11 ribu baris dan terus bertambah.
create index if not exists cashflow_transactions_attachment_retention_idx
  on public.cashflow_transactions (transaction_date)
  where attachment_path is not null;

create index if not exists attendance_logs_selfie_retention_idx
  on public.attendance_logs (date)
  where selfie_path is not null;
