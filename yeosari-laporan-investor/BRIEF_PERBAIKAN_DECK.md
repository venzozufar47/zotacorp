# Brief perbaikan — Laporan Hasil Investasi Yeosari (untuk Claude chat)

Tempel isi bagian "PROMPT" ke Claude chat, lampirkan PDF versi sekarang dan `yeosari_data_laporan_investor.xlsx` (versi TERBARU, sheet per investor dan BEP sudah dikoreksi). Deck ini dibaca semua investor, bersifat umum dan general.

## PROMPT

Perbaiki deck "Laporan Hasil Investasi Yeosari" (17 halaman) berdasarkan semua poin di bawah. Pertahankan desain, struktur halaman, dan angka yang tidak disebut di sini. Sumber angka: xlsx terbaru. Jangan menebak angka; bila ada yang tidak tersedia, jangan dimunculkan di deck dan sebut di daftar akhir. Jangan ada hal yang menggantung dan memancing pertanyaan: setiap angka besar harus punya satu kalimat penjelasan.

### A. Koreksi wajib: BEP dan split bagi hasil
- BEP tercapai Desember 2025: kumulatif dividen seluruh investor Rp112,8 jt = 102,6% dari modal Rp110 jt. Sesuai ketentuan kontrak, setelah modal kembali porsi management naik dari 35% menjadi 50% (investor dari 65% menjadi 50%). **Split 50/50 berlaku sejak Januari 2026.** Jangan mengutip bunyi pasal; cukup tulis "sesuai ketentuan kontrak".
- Pembayaran Mei-Sep 2026 sudah 50/50. Tidak ada kelebihan bayar ke investor. Pembagian Jan-Apr 2026 dihitung estimasi 50% × porsi modal × pool.
- Hapus kalimat keliru: "Data tersimpan memakai 35% management sampai Jul 2026 dan 50% mulai Agu 2026" (hal. 3), anotasi "Agu 26: split 50%" dan kartu "Split management 35% ke 50% berlaku Agu 2026" (hal. 9), butir 4 Lampiran B ("investor menerima sekitar Rp4,8 jt lebih banyak"). Ganti dengan penanda "Des 2025: modal kembali (BEP)" dan "Jan 2026: split 50/50".

Angka yang berubah (sheet `Ringkasan_Per_Investor`, `BEP_Kumulatif`):
| Hal | Lama | Baru |
|---|---|---|
| Dividen ke investor total | 135,6 jt | **133,9 jt** |
| Total diterima (dividen + buyback 32,7 jt) | 168,3 jt | **166,6 jt** |
| Multiple atas modal | 1,53x | **1,51x** |
| Laba bersih investor | 58,3 jt | **56,6 jt** |
| IRR tahunan indikatif | 30,4% | **sekitar 28%** (lihat B2 butir 3) |
| Kumulatif dividen Sep 2026 | 135,6 jt = 123% | **133,9 jt = 121,7%** |

Per investor (Rp jt): dividen s/d Apr 2026 (est.) | Mei-Sep aktual | dividen total | buyback | total diterima | laba bersih
- Qais: 71,00 | 9,35 | 80,35 | 19,62 | 99,97 | 33,97
- Owen: 23,67 | 3,12 | 26,78 | 6,54 | 33,32 | 11,32
- Dicky: 11,83 | 1,56 | 13,39 | 3,27 | 16,66 | 5,66
- Adji: 11,83 | 1,56 | 13,39 | 3,27 | 16,66 | 5,66
- Total: 118,34 | 15,58 | 133,91 | 32,70 | 166,61 | 56,61. Multiple 1,51x untuk semua investor.

Halaman yang disesuaikan: 2, 3, 9 (nilai grafik kumulatif Jan 2026 dst. berubah; titik akhir 133,9), 11, 17 (butir 1 dan 4 Lampiran B; butir 1 harus menyebut 65% sampai Des 2025 dan 50% untuk Jan-Apr 2026).

### B. Kesalahan dan penjelasan yang kurang
1. Hal. 10, catatan kaki "56 item aset" menjadi **59 item**.
2. Hal. 6: "Iklan turun dari Rp16,7 jt (Th1) ke Rp0,3 jt (Th4)" membandingkan 12 bulan dengan 3 bulan. Tulis per bulan: sekitar Rp1,4 jt/bln (Th1) vs sekitar Rp0,1 jt/bln (Th4).
3. Hal. 2 dan 8: pool dividen Rp215,8 jt sedikit di atas laba operasi kumulatif Rp213,3 jt (101,2%). Jelaskan sebagai efek jeda waktu pembayaran dan pemakaian kas bergulir, bukan pembagian di atas laba.
4. **Istilah "chip-in" dan "investor menutup kerugian" harus diganti di seluruh deck** (hal. 2, 3, 8, 9, 17, Lampiran). Mekanisme yang benar: bulan dengan kekurangan (Mar 2025, Sep 2025, Okt 2025, Mar 2026; total Rp11,9 jt) **tidak ada setoran dari investor**. Kekurangan itu ditutup sementara oleh kas toko lalu diperhitungkan dengan memotong keuntungan periode berikutnya. Kartu "Chip-in -Rp11,9 jt" menjadi "Kekurangan yang diperhitungkan -Rp11,9 jt". Di hal. 9 label "Titik terendah Okt 2025" diganti "Kumulatif bersih turun ke 96,9% modal karena kekurangan diperhitungkan (Okt 2025)"; kumulatif bersih tetap pulih melewati modal di Des 2025.
5. Hal. 5, penjelasan Mar 2026 (laba -Rp6,5 jt): gaji Rp11,6 jt karena THR Lebaran (total semua cabang Rp10,3 jt, bagian Yeosari sekitar Rp4,7 jt); sewa Rp8,0 jt karena sewa bulanan Rp5 jt ditambah sewa studio besar Rp3,0 jt; utilitas Rp3,4 jt termasuk wifi tahunan Rp2,442 jt (10 Mar) untuk 12 bulan yang dipakai bersama dua usaha di ruko yang sama. Porsi Yeosari setengahnya, Rp1,221 jt (sekitar Rp102 rb/bln), tetapi dicatat penuh di Yeosari pada Maret. Dengan porsi dan masa pakai yang wajar, laba Mar sekitar -Rp4,2 jt (bukan -Rp6,5 jt). Tulis di deck sebagai catatan kaki, tanpa mengubah angka tabel. Sewa studio besar terjadi dua kali: Mar 2026 (Rp3,0 jt) dan Sep 2026 (Rp4,9 jt).

### B2. Pertanyaan yang pasti muncul dari investor: jawab di deck
1. **Kenapa laba turun dari Th1 ke Th3?** Tambahkan satu kalimat per sebab: (a) sewa naik dari Rp4 jt ke Rp5 jt per bulan sejak Jun 2024 (sempat Rp4 jt Des 2023-Mei 2024) plus sewa studio besar; (b) gaji naik termasuk THR; (c) volume booking turun, terkait pola musiman berikut. Booking Yeosari per bulan: puncak di Jul (libur semester) dan Des (libur akhir tahun, contoh Des 2023 = 373 booking); lembah di Feb-Mar dan Sep-Nov (contoh 2025: Feb 156, Mar 158, Sep 137, Okt 165, Nov 160). Tidak ada penyebab tunggal; tulis sebagai "dinamika booking mengikuti musim kuliah dan sekolah". Jangan menulis kanibalisasi oleh cabang lain (penurunan sudah mulai di H2 2024, sebelum cabang lain buka). Tambahkan grafik atau tabel booking per bulan kalender (sheet `Ops_Bulanan`).
2. **Pemulihan 2026.** Jan-Sep 2026 = 1.898 booking vs 1.802 pada Jan-Sep 2025 (+5%), pertama kali naik dibanding tahun sebelumnya. Jul-Sep 2026 = 697 booking vs 573 (+22%); Agu 2026 259 vs 161, Sep 2026 213 vs 137. Nilai rata-rata per booking naik dari Rp80,9 rb (Th1) ke Rp111 rb (Th4).
3. **Tanggal bayar dividen.** Transfer riil terjadi bulan SESUDAH periode (pool Jan 2026 ditransfer Feb 2026). Hal. 11: tulis IRR **sekitar 28%** (28,1% bila dividen dibayar bulan berikutnya; 29,7% bila di bulan periode). Catatan: angka estimasi, bukan jaminan.
4. **Dividen per investor sebelum Mei 2026 adalah estimasi** (tidak ada riwayat transfer yang bisa dipakai). Tampilkan sebagai estimasi dengan rumus yang jelas; jangan menambahkan ajakan untuk mencocokkan atau janji koreksi.
5. **Biaya bersama.** Satu kalimat metodologi: sebelum 2026 biaya Yeosari dicatat langsung; sejak 2026 biaya bersama antar cabang (iklan, langganan, bahan) dibagi rata tiga cabang dan gaji dialokasikan per karyawan. Pembagian rata 2026 senilai Rp13,5 jt (7,8% dari beban 2026).
6. **Dividen Sep 2026 hanya Rp335 rb.** Jelaskan: laba Sep Rp1,29 jt tertekan sewa studio besar Rp4,9 jt, dan defisit kas bergulir Rp0,79 jt dari bulan sebelumnya ditutup dulu.
7. **Penggunaan modal Rp110 jt.** Tambahkan satu kotak di hal. 3 atau 10: modal dipakai untuk aset bergerak (nilai awal Rp63,3 jt) dan sisanya (sekitar Rp46,7 jt) untuk aset tidak bergerak dan biaya awal: sewa, renovasi, marketing awal, dan sejenisnya. Aset tidak bergerak tidak termasuk dalam buyback. Jangan membuat rincian angka per item karena tidak tersedia.
8. **Buyback.** Nilai final Rp32.696.585 = laporan PDF Rp32.426.583 + Rp270.002 penyesuaian pro-rata biaya wifi tahunan. Penjelasan satu kalimat: wifi tahunan Rp2,442 jt dipakai dua usaha, porsi Yeosari Rp1,221 jt untuk 12 bulan; masa pakai yang tersisa setelah kontrak berakhir (Okt 2026 dst., sekitar 5 bulan) dikembalikan kepada investor sebesar bagian mereka (50%). Perlakukan semua investor sama: tulis "buyback dibayarkan Oktober 2026" tanpa menyebut status transfer per orang dan tanpa menyebut sumber dana. Hapus kalimat "Bagian Qais belum ditransfer dan dianggap dibayar" (hal. 10), kalimat "Owen, Dicky, dan Adji menerima transfer buyback bersama dividen September pada 13 Okt", dan semua penyebutan "pinjaman owner Rp13 jt" (Lampiran B butir 3). Ganti butir 3 dengan: "Dividen September 2026 (Rp335.115) dibayarkan bersamaan dengan buyback."

### C. Yang sudah dicek dan benar (jangan diubah)
Revenue/laba tahunan dan total (866,7 / 653,5 / 213,3), jembatan laba Th1 ke Th3 (jumlahnya 35,1), margin sebelum investasi aset, persentase beban terhadap revenue, booking per hari dan jam, studio dan paket, frekuensi pelanggan, buyback per investor (total 32.696.585), tabel Lampiran A.

### D. Aturan
Bahasa Indonesia; tanpa tanda pisah panjang; jangan sebut istilah internal sistem (konsol, override, ledger); jangan sebut urusan pribadi owner. Setelah perbaikan, buat daftar singkat tiap angka yang berubah (halaman, lama, baru) dan daftar kalimat yang dihapus untuk saya cek.
