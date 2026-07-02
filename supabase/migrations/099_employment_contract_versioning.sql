-- Employment contract versioning.
--
-- Sebelumnya, saat isi kontrak berubah (mis. menambah pasal), tidak ada cara
-- rapi untuk meminta karyawan tanda tangan ulang tanpa menduplikasi baris.
-- Kolom ini memberi model versi:
--   version        = versi isi kontrak SAAT INI (naik tiap ada revisi)
--   signed_version = versi yang benar-benar ditandatangani karyawan (NULL = belum)
--   update_note    = ringkasan perubahan versi terbaru (ditampilkan ke karyawan)
--
-- Aturan turunan:
--   perlu TTD  = status='pending_signature'
--                ATAU (status='signed' AND signed_version < version)
--   sudah beres = status='signed' AND signed_version >= version
-- Menandatangani menyetel signed_version = version.
ALTER TABLE employment_contracts
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS signed_version int,
  ADD COLUMN IF NOT EXISTS update_note text;

-- Backfill: kontrak yang sudah ditandatangani dianggap menandatangani versi 1.
UPDATE employment_contracts
SET signed_version = 1
WHERE status = 'signed' AND signed_version IS NULL;
