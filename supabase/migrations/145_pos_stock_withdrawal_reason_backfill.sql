-- 145: Backfill `withdrawal_reason` dari catatan bebas yang lama.
--
-- Heuristik teks, BUKAN data otoritatif. Aturan di bawah dikalibrasi
-- terhadap 224 baris penarikan yang ada per 14 Sep 2026; sekitar 197
-- baris (88%) terpetakan, 27 baris tanpa catatan sengaja dibiarkan NULL
-- ("tidak diketahui") dan ditampilkan sebagai caveat di halaman metrik,
-- bukan diam-diam dihitung nol.
--
-- `notes` TIDAK diubah — teks aslinya tetap bisa diaudit kalau nanti
-- ada pemetaan yang dipersoalkan.
--
-- URUTAN ATURAN ADALAH BAGIAN DARI DESAIN (CASE berhenti di kecocokan
-- pertama):
--   1. Koreksi didahulukan mutlak. `konten ( salah input)` itu koreksi,
--      bukan konten. Ini juga yang menangkap baris rusak qty
--      100.203.998 ("salah input. hp baru penyesuaian.", 27 Jul) supaya
--      tidak pernah bocor ke metrik.
--   2. `exp` mendahului `rusak` supaya `expired\rusak` (6 baris, 33 qty)
--      dan `rusak, exp, tester` terhitung expired — expired sebab
--      hulunya, rusaknya akibat.
--   5. `konten` mendahului konversi supaya `di potong untuk konten`
--      tidak tersedot pola `untuk `.
--   8. Catatan bebas yang tersisa di data ini seluruhnya nama orang
--      (`mbak ing`, `zota`, `irnanda`, `tukang`), jadi jadi
--      konsumsi_internal.
--
-- Batas yang diketahui dan diterima: beberapa baris satuan salah kamar
-- antar kategori BUKAN-susut (mis. `zota, untuk dikasih ke alarik` jadi
-- konversi_sku, `buat besok` jadi konversi_sku). Tidak ada yang salah
-- kamar MASUK atau KELUAR dari kelompok susut, jadi angka susut tidak
-- terpengaruh.

UPDATE public.pos_stock_movements
SET withdrawal_reason = CASE
  WHEN lower(notes) ~ 'salah input|double input|kelebihan|tertukar|selisih|diinput manual|penyesuaian'
    THEN 'koreksi_input'
  WHEN lower(notes) ~ 'exp'                              THEN 'expired'
  WHEN lower(notes) ~ 'rusak|jatuh|gagal|tidak sesuai'   THEN 'rusak'
  WHEN lower(notes) ~ 'test|uji coba'                    THEN 'testing'
  WHEN lower(notes) ~ 'konten'                           THEN 'konten'
  WHEN lower(notes) ~ 'untuk |diubah|diganti|custom|cake hias|pesanan|besok'
    THEN 'konversi_sku'
  WHEN lower(notes) ~ 'free|kompensasi|hadiah'           THEN 'hadiah_kompensasi'
  ELSE 'konsumsi_internal'
END
WHERE type = 'withdrawal'
  AND withdrawal_reason IS NULL
  AND coalesce(trim(notes), '') <> '';
