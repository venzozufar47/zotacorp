/**
 * Default body markdown untuk template kontrak. Placeholder pakai `{token}`
 * (lihat ContractFieldKey). Blok tanda tangan + Lampiran 1 SENGAJA tidak ada
 * di sini — keduanya dirender terstruktur oleh ContractPdfDocument.
 */

/** Data PIHAK PERTAMA (Pemberi Kerja) — hardcode, dipakai di semua kontrak. */
export const EMPLOYER = {
  name: "Avenzoar Zufar Qisthauzan",
  jabatan: "Pemilik & Direktur",
  alamat: "Jl. Nogososro Baru 87L, Tlogosari, Pedurungan, Kota Semarang",
} as const;

/** Tanggal bayar gaji baku untuk seluruh karyawan. */
export const TGL_BAYAR_DEFAULT = "5 (lima)";

export const YEOBO_SPACE_CONTRACT_BODY = `# PERJANJIAN KERJA

**Nomor: {nomor}/PK/YS/{tahun}**

Pada hari ini, {hari}, tanggal {tanggal} bulan {bulan} tahun {tahun}, bertempat di {kota}, yang bertanda tangan di bawah ini:

**1. Pemberi Kerja**

- Nama: {pemberi_nama}
- Jabatan: {pemberi_jabatan}
- Alamat: {pemberi_alamat}

Dalam hal ini bertindak untuk dan atas nama Yeobo Space, yang selanjutnya disebut sebagai **PIHAK PERTAMA** atau **Pemberi Kerja**.

**2. Karyawan**

- Nama: {nama}
- NIK: {nik}
- Tempat/Tanggal Lahir: {tempat_lahir}, {tgl_lahir}
- Alamat: {alamat}

Dalam hal ini bertindak untuk dan atas nama diri sendiri, yang selanjutnya disebut sebagai **PIHAK KEDUA** atau **Karyawan**.

**PIHAK PERTAMA** dan **PIHAK KEDUA** selanjutnya secara bersama-sama disebut sebagai **Para Pihak** dan secara sendiri-sendiri disebut sebagai **Pihak**.

Para Pihak terlebih dahulu menerangkan hal-hal sebagai berikut:

- bahwa Pemberi Kerja menjalankan kegiatan usaha di bidang jasa studio foto mandiri (self photo studio) dengan merek Yeobo Space;
- bahwa Pemberi Kerja membutuhkan tenaga kerja dan Karyawan menyatakan bersedia bekerja pada Pemberi Kerja untuk jangka waktu tertentu;
- bahwa Para Pihak memandang hubungan kerja ini sebagai hubungan kerja sama yang setara dan saling menguntungkan, yang dilandasi itikad baik, saling menghormati, serta keseimbangan antara hak dan kewajiban masing-masing Pihak;
- bahwa kelancaran operasional dan kualitas layanan Yeobo Space bergantung pada kepatuhan terhadap Standar Operasional Prosedur yang berlaku.

Berdasarkan hal-hal tersebut di atas, Para Pihak sepakat untuk mengikatkan diri dalam Perjanjian Kerja (selanjutnya disebut "Perjanjian") dengan syarat dan ketentuan sebagai berikut.

---

## Pasal 1: Ketentuan Umum dan Definisi

(1) Pemberi Kerja adalah Yeobo Space sebagaimana diwakili oleh PIHAK PERTAMA dalam Perjanjian ini.

(2) Karyawan adalah PIHAK KEDUA yang terikat dalam hubungan kerja dengan Pemberi Kerja berdasarkan Perjanjian ini.

(3) Standar Operasional Prosedur, selanjutnya disebut SOP, adalah seluruh pedoman, prosedur, dan tata cara kerja baku yang ditetapkan oleh Pemberi Kerja, baik secara tertulis maupun yang dikomunikasikan secara resmi, yang mengatur pelaksanaan pekerjaan, pelayanan pelanggan, penggunaan dan pemeliharaan peralatan, serta operasional studio.

(4) Deskripsi Pekerjaan adalah uraian tugas, tanggung jawab, dan indikator kinerja yang sesuai dengan posisi Karyawan, sebagaimana tercantum dalam Lampiran 1 yang merupakan bagian tidak terpisahkan dari Perjanjian ini.

(5) Upah adalah hak Karyawan yang diterima dan dinyatakan dalam bentuk uang sebagai imbalan atas pekerjaan yang telah atau akan dilakukan.

## Pasal 2: Pengangkatan, Jabatan, dan Penempatan

(1) Pemberi Kerja mengangkat Karyawan untuk menduduki posisi atau jabatan sebagai {jabatan}.

(2) Karyawan ditempatkan pada cabang Yeobo Space {cabang}.

(3) Uraian tugas, tanggung jawab, dan indikator kinerja Karyawan diatur secara rinci dalam Lampiran 1 (Deskripsi Pekerjaan) yang merupakan satu kesatuan dan bagian tidak terpisahkan dari Perjanjian ini.

(4) Pemberi Kerja dapat melakukan penyesuaian penugasan atau penempatan sesuai kebutuhan operasional dengan tetap memperhatikan kemampuan dan kapasitas Karyawan, yang akan dikomunikasikan terlebih dahulu kepada Karyawan.

## Pasal 3: Jangka Waktu Perjanjian

(1) Perjanjian ini berlaku untuk jangka waktu 6 (enam) bulan, terhitung sejak tanggal {tgl_mulai} sampai dengan tanggal {tgl_berakhir}.

(2) Perjanjian dapat diperpanjang berdasarkan kesepakatan Para Pihak dengan mempertimbangkan hasil penilaian kinerja, yang dituangkan dalam perjanjian perpanjangan tersendiri.

(3) Apabila jangka waktu Perjanjian berakhir dan tidak diperpanjang, hubungan kerja antara Para Pihak berakhir dengan sendirinya.

## Pasal 4: Waktu Kerja dan Waktu Istirahat

(1) Karyawan melaksanakan pekerjaan sesuai dengan jadwal kerja yang ditetapkan oleh Pemberi Kerja.

(2) Mengingat sifat operasional studio, jadwal kerja dapat diatur dalam sistem giliran kerja (shift) sesuai kebutuhan, yang akan diinformasikan kepada Karyawan sebelumnya.

(3) Karyawan berhak atas waktu istirahat dan hari libur sesuai dengan jadwal yang ditetapkan.

(4) Pekerjaan yang dilaksanakan melebihi waktu kerja yang ditetapkan diperhitungkan dan dibayarkan berdasarkan kesepakatan Para Pihak.

## Pasal 5: Upah dan Cara Pembayaran

(1) Karyawan berhak atas upah sebesar Rp {gaji_nominal} ({gaji_terbilang} rupiah) per bulan.

(2) Besaran upah sebagaimana dimaksud pada ayat (1) ditetapkan berdasarkan kesepakatan Para Pihak.

(3) Komponen upah sebagaimana dimaksud pada ayat (1) terdiri atas {komponen_upah}, dengan rincian sebagaimana disepakati Para Pihak.

(4) Upah dibayarkan secara {periode_bayar} paling lambat tanggal {tgl_bayar} bulan berikutnya, melalui {cara_bayar}.

(5) Pemotongan atas upah hanya dapat dilakukan atas persetujuan Karyawan.

## Pasal 6: Hak dan Kewajiban Karyawan

(1) Karyawan mempunyai hak sebagai berikut:

- menerima upah sesuai dengan Pasal 5 Perjanjian ini;
- memperoleh waktu istirahat dan hari libur sesuai dengan Pasal 4 Perjanjian ini;
- memperoleh perlakuan yang adil, lingkungan kerja yang layak dan aman, serta peralatan kerja yang memadai;
- menyampaikan pendapat, masukan, atau keberatan secara wajar melalui mekanisme komunikasi yang tersedia.

(2) Karyawan mempunyai kewajiban sebagai berikut:

- melaksanakan tugas dan tanggung jawab sesuai dengan Deskripsi Pekerjaan (Lampiran 1) secara penuh tanggung jawab dan profesional;
- memahami dan mematuhi seluruh SOP yang berlaku sebagaimana diatur dalam Pasal 7 Perjanjian ini;
- hadir dan melaksanakan pekerjaan sesuai dengan jadwal kerja yang ditetapkan;
- menjaga sikap profesional serta memberikan pelayanan yang baik kepada pelanggan;
- menggunakan, menjaga, dan memelihara peralatan serta aset studio sesuai dengan prosedur;
- menjaga nama baik, kerahasiaan, dan kepentingan Pemberi Kerja.

## Pasal 7: Kepatuhan terhadap Standar Operasional Prosedur (SOP)

(1) Karyawan wajib memahami, mematuhi, dan melaksanakan seluruh SOP yang ditetapkan oleh Pemberi Kerja, termasuk namun tidak terbatas pada SOP pelayanan pelanggan, SOP buka dan tutup studio, SOP penggunaan dan pemeliharaan peralatan (antara lain kamera, pencahayaan, printer, dan perangkat preview), SOP kebersihan, serta SOP penanganan hasil cetak dan data pelanggan.

(2) SOP merupakan bagian dari standar kerja yang bersifat mengikat dan menjadi salah satu dasar dalam penilaian kinerja Karyawan.

(3) Pemberi Kerja dapat memperbarui, menambah, atau menyempurnakan SOP sesuai dengan kebutuhan operasional. Setiap perubahan akan dikomunikasikan secara resmi kepada Karyawan, dan Karyawan wajib menyesuaikan diri dengan SOP terbaru yang berlaku.

(4) Sebagai bagian dari keseimbangan hak dan kewajiban, Pemberi Kerja berkewajiban menyediakan akses, sosialisasi, dan/atau pelatihan yang memadai atas SOP agar Karyawan dapat memahami dan mematuhinya.

(5) Pelanggaran terhadap SOP dikenakan pembinaan dan sanksi sebagaimana diatur dalam Pasal 10 Perjanjian ini, dengan tetap memperhatikan jenis dan bobot pelanggaran.

## Pasal 8: Hak dan Kewajiban Pemberi Kerja

(1) Pemberi Kerja mempunyai hak sebagai berikut:

- memperoleh pelaksanaan pekerjaan dari Karyawan sesuai dengan Deskripsi Pekerjaan dan SOP yang berlaku;
- menetapkan, mengatur, dan mengawasi pelaksanaan pekerjaan serta jadwal kerja;
- melakukan penilaian kinerja terhadap Karyawan;
- memberikan pembinaan dan sanksi atas pelanggaran sesuai dengan Perjanjian ini.

(2) Pemberi Kerja mempunyai kewajiban sebagai berikut:

- membayar upah secara penuh dan tepat waktu sesuai dengan Pasal 5 Perjanjian ini;
- menyediakan lingkungan kerja yang layak dan aman serta peralatan kerja yang memadai;
- menyediakan SOP, sosialisasi, dan/atau pelatihan yang diperlukan oleh Karyawan;
- memperlakukan Karyawan secara adil dan menghormati hak-hak Karyawan.

## Pasal 9: Penilaian Kinerja

(1) Pemberi Kerja melakukan penilaian kinerja Karyawan secara berkala berdasarkan pelaksanaan Deskripsi Pekerjaan, kepatuhan terhadap SOP, kedisiplinan, dan kualitas pelayanan.

(2) Hasil penilaian kinerja menjadi dasar bagi pembinaan, pengembangan Karyawan, serta pertimbangan perpanjangan Perjanjian.

(3) Pemberi Kerja menyampaikan hasil penilaian kinerja kepada Karyawan secara terbuka, dan Karyawan berhak memberikan tanggapan atas penilaian tersebut.

## Pasal 10: Tata Tertib dan Sanksi

(1) Karyawan wajib mematuhi tata tertib dan disiplin kerja yang ditetapkan oleh Pemberi Kerja.

(2) Atas pelanggaran terhadap Perjanjian, SOP, atau tata tertib, Pemberi Kerja dapat memberikan sanksi secara bertahap berupa:

- teguran lisan;
- surat peringatan tertulis;
- tindakan lain sesuai dengan kebijakan Pemberi Kerja.

(3) Tingkat dan jenis sanksi disesuaikan dengan jenis, bobot, dan frekuensi pelanggaran yang dilakukan, serta diberikan dengan tetap memperhatikan asas keadilan dan kesempatan Karyawan untuk memperbaiki diri.

(4) Terhadap pelanggaran berat, Pemberi Kerja dapat mengambil tindakan tegas termasuk pengakhiran hubungan kerja, dengan tetap memberikan kesempatan klarifikasi kepada Karyawan.

## Pasal 11: Kerahasiaan dan Aset Perusahaan

(1) Karyawan wajib menjaga kerahasiaan seluruh informasi milik Pemberi Kerja, termasuk namun tidak terbatas pada data pelanggan, foto pelanggan, data operasional, struktur harga, serta informasi usaha lainnya.

(2) Karyawan dilarang menyalahgunakan, menyebarluaskan, atau menggunakan data dan foto pelanggan untuk kepentingan di luar pekerjaan tanpa izin dari Pemberi Kerja dan/atau pelanggan yang bersangkutan.

(3) Seluruh peralatan, perlengkapan, dan aset yang disediakan oleh Pemberi Kerja wajib digunakan sesuai dengan peruntukannya dan dikembalikan dalam keadaan baik pada saat berakhirnya hubungan kerja.

(4) Kewajiban menjaga kerahasiaan sebagaimana dimaksud pada ayat (1) tetap berlaku meskipun hubungan kerja telah berakhir.

## Pasal 12: Berakhirnya Hubungan Kerja

(1) Hubungan kerja berakhir pada saat jangka waktu Perjanjian berakhir sebagaimana dimaksud dalam Pasal 3 Perjanjian ini.

(2) Salah satu Pihak dapat mengakhiri hubungan kerja sebelum berakhirnya jangka waktu dengan pemberitahuan terlebih dahulu kepada Pihak lainnya.

(3) Karyawan wajib menyelesaikan seluruh kewajibannya dan mengembalikan seluruh aset milik Pemberi Kerja sebelum hubungan kerja berakhir.

## Pasal 13: Penyelesaian Perselisihan

(1) Apabila terjadi perselisihan sehubungan dengan pelaksanaan Perjanjian ini, Para Pihak sepakat untuk menyelesaikannya terlebih dahulu secara musyawarah untuk mencapai mufakat dengan dilandasi itikad baik.

(2) Apabila penyelesaian secara musyawarah tidak mencapai mufakat, Para Pihak akan menyelesaikannya secara kekeluargaan dengan tetap dilandasi itikad baik.

## Pasal 14: Ketentuan Penutup

(1) Hal-hal yang belum diatur atau belum cukup diatur dalam Perjanjian ini akan diatur kemudian berdasarkan kesepakatan Para Pihak.

(2) Lampiran dan dokumen yang disebut dalam Perjanjian ini merupakan bagian yang tidak terpisahkan dari Perjanjian.

(3) Perubahan atau penambahan atas Perjanjian ini hanya sah dan mengikat apabila disepakati secara tertulis oleh Para Pihak.

(4) Perjanjian ini dibuat dan ditandatangani oleh Para Pihak dalam keadaan sehat jasmani dan rohani serta tanpa adanya paksaan dari pihak manapun.

(5) Perjanjian ini dibuat dalam rangkap 2 (dua) asli, masing-masing bermaterai cukup dan memiliki kekuatan hukum yang sama, 1 (satu) rangkap untuk Pemberi Kerja dan 1 (satu) rangkap untuk Karyawan.

Demikian Perjanjian ini dibuat dan ditandatangani oleh Para Pihak pada hari dan tanggal sebagaimana tersebut di atas.`;
