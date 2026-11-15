# Data laporan investasi Yeosari (Yeobo Space Tlogosari) — untuk deck investor

Dikumpulkan 6 Nov 2026 dari database produksi. Berkas data: `yeosari_data_laporan_investor.xlsx` (23 sheet). Unggah xlsx + README ini ke Claude chat.

## Konteks
- Unit: Yeobo Space Tlogosari ("Yeosari"), studio foto self-photo, Semarang.
- Kontrak investor: 1 Jul 2023 sampai 30 Sep 2026 (39 bulan). Total modal Rp110.000.000.
- Investor: Qais Faishal Azhar 60% (66jt), Owen Caesar Hadiputra 20% (22jt), Dicky Erlangga 10% (11jt), Adji Sepvian Budiono 10% (11jt).
- Bagi hasil: dari pool dividen bulanan, management 35% dan investor 65% sebelum BEP; setelah BEP management 50% dan investor 50%. BEP tercapai Des 2025 (kumulatif dividen investor Rp112,8jt = 102,6% modal), jadi split 50% berlaku sejak Jan 2026. Pembayaran aktual Mei-Sep 2026 sudah 50/50 (flag after_bep tersimpan false untuk Mei-Jul hanyalah flag usang).
- Mulai Oktober 2026 dividen Yeosari 100% hak owner. Aset bergerak dibeli balik owner (buyback) per 30 Sep 2026.

## Hasil kunci (semua angka dari xlsx)
- Revenue kumulatif Rp866,7jt; laba operasi kumulatif Rp213,3jt (margin 24,6%); rata-rata laba Rp5,47jt per bulan.
- Per tahun kontrak, laba operasi: Th1 113,4jt (margin 39,3%), Th2 48,8jt (19,3%), Th3 35,1jt (14,0%), Th4 (Jul-Sep 2026) 16,0jt (21,4%). Laba turun tajam dari Th1 ke Th3 karena revenue turun dan beban naik.
- Total pool dividen netto Rp215,8jt. Dividen ke investor Rp133,9jt + buyback Rp32,7jt = Rp166,6jt atas modal Rp110jt.
- Per investor: total diterima 1,51x modal (laba bersih Rp56,6jt); IRR tahunan indikatif 29,7%. Detail di sheet `Ringkasan_Per_Investor`.
- Modal investor kembali (kumulatif dividen investor melewati 110jt) pada Des 2025; per Sep 2026 kumulatif Rp133,9jt (121,7% modal). Sempat hampir tercapai Agt 2025 (99,9%) lalu turun ke 96,9% (Okt 2025) karena bulan chip-in.
- Operasional: 9.147 booking confirmed senilai Rp859,9jt (selisih dengan revenue ledger Rp866,7jt kecil); sekitar 7.567 pelanggan unik teridentifikasi, 85% hanya sekali booking. Studio regular 7.752 booking, pas foto 1.110, large 285. Paket terbanyak self-2 (4.268) dan self-3-5 (2.671).

## Daftar sheet
`Ringkasan`, `Ringkasan_Tahun_Kontrak`, `Kontrak_Investor`, `Ringkasan_Per_Investor`, `PnL_Bulanan`, `PnL_Kategori_Long`, `Dividen_Pool_Bulanan`, `Dividen_Per_Investor_Bulanan`, `BEP_Kumulatif`, `Buyback_Aset`, `Buyback_Per_Investor`, `Ops_Bulanan`, `Ops_Studio`, `Ops_Paket`, `Ops_Pembayaran`, `Ops_Sumber_Info`, `Ops_Promo`, `Ops_Hari`, `Ops_Jam_Mulai`, `Ops_Frekuensi_Pelanggan`.

## Definisi
- Laba operasi = revenue operasional − beban operasional. Beban termasuk Asset Investment (pembelian aset dibebankan langsung, bukan disusutkan). Non-operasional (dividen, wealth transfer, utang owner) dipisah dan tidak masuk laba.
- Pool dividen = dividen total cabang (management + investor) per bulan. Negatif berarti ada kekurangan bulan itu: tidak ada setoran investor, kekurangan ditutup sementara kas toko lalu diperhitungkan dengan memotong keuntungan periode berikutnya: 2025-03, 2025-09, 2025-10, 2026-03.
- Tahun kontrak ke-n: Th1 = Jul 2023-Jun 2024, Th2 = Jul 2024-Jun 2025, Th3 = Jul 2025-Jun 2026, Th4 = Jul-Sep 2026 (3 bulan).
- Revenue = pemasukan ledger rekening koran (Mayar/QRIS, transfer, cash). Nilai booking = `total_amount_idr` booking berstatus confirmed (bisa beda tipis dengan ledger karena waktu pencairan).
- Pelanggan unik: pelanggan terdaftar (user id) atau nomor telepon yang di-hash. Tidak ada data pribadi di berkas ini.

## Catatan kualitas data — baca sebelum membuat deck
1. **Dividen per investor sebelum Mei 2026 adalah ESTIMASI**: porsi modal × 65% × pool sampai Des 2025, lalu × 50% × pool untuk Jan-Apr 2026 (setelah BEP). Tabel pembayaran per investor baru ada sejak Mei 2026 (aktual). Kolom `dasar` menandai tiap baris.
2. **Angka pool 2023-2025 berasal dari data kesepakatan/hardcode**, bukan dari rekening koran. Jan-Apr 2026 dari tabel override. Mei 2026 dst. dari konsol dividen (keputusan admin).
3. **Dividen September 2026 (pool Rp335.115)** diinput 13 Okt 2026 dan dibayar bersamaan dengan transfer buyback. Tidak ada mutasi dividen di rekening koran Yeobo karena dibayar dari pinjaman owner 13jt.
4. **Titik BEP (sudah diluruskan).** Kumulatif 65% pool melewati Rp110jt pada Des 2025, sesuai ingatan owner (Des 2025-Jan 2026). Bulan yang melewati ambang masih "sebelum BEP", jadi split 50% berlaku sejak Jan 2026. Pembayaran aktual Mei-Sep 2026 memang 50/50; pembagian Jan-Apr 2026 tidak tersimpan dan diasumsikan 50/50. Versi awal berkas ini keliru (memakai 65% untuk Jan-Apr 2026 dan menyebut 35% sampai Jul 2026).
5. **Buyback:** laporan PDF 30 Sep 2026 menghitung nilai terdepresiasi Rp32.426.583 dari nilai awal Rp63.307.291 (garis lurus, residu 10%; elektronik 48 bln, perabot 96 bln, aksesoris 12 bln; beberapa aset disesuaikan dari riset pasar). Nilai buyback final yang dicatat Rp32.696.585 (+Rp270.002 penyesuaian), dibagi menurut porsi modal. Qais (Rp19.617.951) belum ditransfer, dianggap dibayar. Owen/Dicky/Adji sudah ditransfer 13 Okt 2026 bersama dividen September: Owen total 6.572.829, Dicky 3.286.414, Adji 3.286.415.
6. **Rent September 2026 Rp9.895.900** (dua entri: sewa bulanan 5jt + Sewa Studio Besar 4.895.900) — sewa tambahan yang sah; menekan laba September menjadi Rp1,29jt.
7. **IRR** memakai arus kas bulanan dari sheet per investor (modal keluar Jul 2023, dividen sebagai penerimaan bulan periode, buyback bulan ke-40). Indikatif saja; tanggal bayar riil sebelum 2026 tidak tersedia.
8. **Data ops:** hanya booking via sistem reservasi web; penjualan walk-in di luar sistem (jika ada) tidak ada. `pelanggan_baru` dihitung dari kemunculan pertama di data (dimulai Jul 2023, jadi bulan awal cenderung tinggi). 80 booking tanpa metode bayar; 85% pelanggan hanya sekali booking.
9. Bulan Oktober 2026 (pasca-kontrak) sengaja tidak dimasukkan. Revenue Okt 2026 Rp21,5jt dan laba operasi Rp3,58jt tersedia bila perlu.
10. Pembukuan Oktober 2026 sudah dikoreksi (refund per cabang, alokasi gaji, iklan) sebelum ekspor ini; Sep 2026 dan sebelumnya tidak diubah.
