-- Retensi foto bukti kebersihan.
--
-- Foto checklist menumpuk cepat (±94 foto/hari setelah Yeobo aktif, ~99 KB
-- masing-masing ≈ 3,4 GB/tahun) padahal nilainya jatuh drastis setelah
-- beberapa minggu — yang dipakai untuk audit jangka panjang adalah CATATAN
-- "siapa mengerjakan apa dan kapan", bukan gambarnya.
--
-- Sweeper harian (src/lib/storage/cleaning-retention.ts) menghapus file di
-- bucket `cleaning-photos` yang completion-nya lebih tua dari batas retensi,
-- lalu mengosongkan photo_path dan menstempel photo_purged_at. Baris
-- completion-nya sendiri TIDAK dihapus.
--
-- Kolom ini yang membuat UI bisa jujur: photo_path NULL + photo_purged_at
-- terisi = "fotonya kedaluwarsa", berbeda dari photo_path NULL sejak awal
-- (item centang tanpa foto). Tanpa penanda ini keduanya tak bisa dibedakan
-- dan riwayat lama akan terlihat seolah karyawan tidak pernah memotret.

alter table public.cleaning_task_completions
  add column if not exists photo_purged_at timestamptz;

-- Galeri review admin memindai rentang tanggal lintas-karyawan; index yang ada
-- adalah (user_id, date) sehingga tidak menolong query yang tidak menyebut user.
create index if not exists cleaning_task_completions_date_idx
  on public.cleaning_task_completions(date desc);

-- Sweeper mencari baris "punya foto dan sudah lewat batas" — index parsial ini
-- membuatnya tetap murah walau tabel tumbuh puluhan ribu baris.
create index if not exists cleaning_task_completions_photo_sweep_idx
  on public.cleaning_task_completions(date)
  where photo_path is not null;
