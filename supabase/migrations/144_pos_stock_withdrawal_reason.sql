-- 144: Alasan penarikan stok jadi pilihan tertutup (closed choice).
--
-- Sebelum ini alasan penarikan ditulis bebas di `notes`, dan hasilnya
-- tidak bisa dianalisis. Audit 224 baris pertama (22 Apr – 14 Sep 2026,
-- Pare + Semarang) menemukan: `exp` / `expired` / `expired\rusak` untuk
-- hal yang sama, `testing` / `tester` / `uji coba` untuk hal yang sama,
-- dan 43 baris yang isinya cuma nama orang (`mbak ing`, `zota`,
-- `irnanda`) — yang ternyata konsumsi internal 77 qty, sebanding dengan
-- seluruh kerugian akibat rusak (80 qty), dan selama ini tak terlihat.
--
-- Yang penting untuk metrik: hanya sekitar SEPERTIGA qty penarikan
-- adalah kerugian (expired 188 + rusak 80, dari total 551 qty). Sisanya
-- testing, konten, konsumsi internal, konversi SKU, dan koreksi input.
-- Karena itu kolom ini bukan sekadar label — dia yang menentukan baris
-- mana boleh masuk metrik susut di /admin/service-level.
--
-- Sengaja BUKAN not null:
--   - kolom ini menumpang tabel yang dipakai bersama `type='production'`,
--     yang tidak punya konsep alasan;
--   - 27 baris lama tidak punya catatan sama sekali dan tidak boleh
--     ditebak — NULL berarti "tidak diketahui", dan metrik memperlakukan
--     NULL sebagai bukan-susut sambil menampilkannya sebagai caveat.
--
-- Backfill baris lama ada di migrasi 145 (terpisah supaya bisa
-- di-rollback sendiri tanpa membuang kolomnya).
--
-- `notes` TIDAK disentuh dan tidak dideprekasi: alasan menjawab
-- "kategori apa", catatan tetap menampung detail bebas.

ALTER TABLE public.pos_stock_movements
  ADD COLUMN IF NOT EXISTS withdrawal_reason text;

COMMENT ON COLUMN public.pos_stock_movements.withdrawal_reason IS
  'Alasan penarikan (hanya untuk type=withdrawal): expired | rusak | testing | konten | konsumsi_internal | hadiah_kompensasi | konversi_sku | koreksi_input | lainnya. Susut = expired + rusak. konversi_sku & koreksi_input adalah artefak pembukuan dan TIDAK PERNAH dihitung sebagai kerugian. NULL = baris produksi, atau baris penarikan lama yang tidak terpetakan saat backfill 145.';

ALTER TABLE public.pos_stock_movements
  DROP CONSTRAINT IF EXISTS pos_stock_movements_withdrawal_reason_check;
ALTER TABLE public.pos_stock_movements
  ADD CONSTRAINT pos_stock_movements_withdrawal_reason_check
  CHECK (
    withdrawal_reason IS NULL
    OR (
      type = 'withdrawal'
      AND withdrawal_reason IN (
        'expired',
        'rusak',
        'testing',
        'konten',
        'konsumsi_internal',
        'hadiah_kompensasi',
        'konversi_sku',
        'koreksi_input',
        'lainnya'
      )
    )
  );

-- Indeks parsial: metrik susut selalu memfilter alasan non-NULL dalam
-- rentang tanggal satu outlet. Indeks penuh yang sudah ada
-- (account, movement_date) tetap melayani perhitungan stok on-hand.
CREATE INDEX IF NOT EXISTS pos_stock_movements_reason_idx
  ON public.pos_stock_movements (bank_account_id, movement_date DESC)
  WHERE withdrawal_reason IS NOT NULL;
