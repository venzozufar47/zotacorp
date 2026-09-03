-- Tunggakan (arrears) dividen per-penerima untuk Yeobo Space.
--
-- `yeobo_dividend_allocations.amount_idr` selama ini merangkap dua makna:
-- "hak" dan "yang benar-benar ditransfer" dianggap selalu sama. Begitu
-- admin membayar SEBAGIAN penerima saja (mis. management dulu, investor
-- ditahan karena kas ketat), sisa hak yang tertahan itu hilang jejaknya —
-- tidak ada cara membedakan "bulan ini memang belum diputuskan" dari
-- "sudah diputuskan, sengaja/terpaksa belum ditransfer semua".
--
-- `entitlement_idr` memisahkan makna itu. `amount_idr` TIDAK berubah arti
-- (tetap "yang ditransfer" — semua pembaca existing: yeobo_dividend_pnl_rows(),
-- panel rekonsiliasi, mirror investor_payouts, roll-forward Kas — aman tanpa
-- perubahan). Tunggakan per penerima s/d bulan M dihitung di application
-- layer sebagai Σ entitlement_idr − Σ amount_idr untuk periode ≤ M.
--
-- Backfill: baris lama (sebelum fitur ini) diisi entitlement = amount, jadi
-- tunggakan awal = 0 untuk seluruh riwayat — bukan salah baca, terverifikasi
-- (script scripts/audit-dividend-arrears.ts) semua bulan s/d Juli 2026 lunas
-- penuh (Σ amount_idr = pool_idr tiap bulan).
--
-- NOT NULL tanpa DEFAULT (disengaja): DEFAULT 0 berbahaya di sini — penulis
-- yang lupa mengisi kolom akan diam-diam mencatat "tidak berhak apa-apa",
-- yang terbaca sebagai lebih-bayar dan menciptakan kredit palsu. Tanpa
-- default, lupa mengisi = insert gagal keras, bukan data salah senyap.

ALTER TABLE public.yeobo_dividend_allocations
  ADD COLUMN IF NOT EXISTS entitlement_idr NUMERIC(16,2);

UPDATE public.yeobo_dividend_allocations
   SET entitlement_idr = amount_idr
 WHERE entitlement_idr IS NULL;

ALTER TABLE public.yeobo_dividend_allocations
  ALTER COLUMN entitlement_idr SET NOT NULL;

ALTER TABLE public.yeobo_dividend_allocations
  DROP CONSTRAINT IF EXISTS yeobo_dividend_allocations_entitlement_chk;
ALTER TABLE public.yeobo_dividend_allocations
  ADD CONSTRAINT yeobo_dividend_allocations_entitlement_chk
    CHECK (entitlement_idr >= 0);

COMMENT ON COLUMN public.yeobo_dividend_allocations.entitlement_idr IS
  'Hak penerima atas pool bulan ini, dibekukan saat deklarasi pool oleh admin. '
  'amount_idr = yang BENAR-BENAR ditransfer (arti kolom itu tidak berubah). '
  'Tunggakan per penerima = Σ entitlement_idr − Σ amount_idr (periode ≤ bulan terpilih). '
  'CHECK >= 0 adalah backstop saja — computeRecipientAmounts() menjadikan '
  'management sebagai residual (pool − Σ investor), yang bisa negatif hanya '
  'jika investor oversubscribed > 100% pool; sejak migrasi 129 (pool_pct '
  'diturunkan dari kontrak) Σ selalu tepat 100% sehingga ini tidak tercapai '
  'dalam kondisi normal — validasi utama tetap dilakukan di application layer '
  'sebelum insert, supaya kegagalan tidak terjadi di tengah loop multi-baris.';

-- Tidak ada index baru: UNIQUE (recipient_id, period_year, period_month)
-- yang sudah ada menyediakan btree dengan recipient_id di posisi terdepan,
-- cukup untuk query "seluruh riwayat satu recipient" yang dipakai
-- perhitungan tunggakan.
--
-- pool_idr SENGAJA tidak disentuh — kolom itu ditulis (Σ amount_idr saat
-- save) tapi tidak pernah dibaca di manapun di src/; memaknai ulang jadi
-- "pool deklarasi" akan diam-diam mengubah arti baris historis. Pool
-- deklarasi diturunkan sebagai Σ entitlement_idr per branch-bulan, yang
-- eksak karena management adalah residual dalam computeRecipientAmounts().
--
-- RLS tidak berubah: kedua policy (ydiv_alloc_admin_all, ydiv_alloc_self_read)
-- bersifat row-level, kolom baru otomatis ikut cakupannya — seorang investor
-- kini bisa membaca entitlement_idr miliknya sendiri (uangnya sendiri),
-- meski belum ada UI yang menampilkannya ke investor (lihat plan: investor
-- belum diberi akses tampilan tunggakan pada tahap ini).
