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

/**
 * Template Perjanjian Kerja Waktu Tidak Tertentu (PKWTT) Haengbocake. Tanpa
 * lampiran: uraian tugas dan wewenang jabatan diatur di SOP. Token sama dengan
 * template Yeobo; tanggal berakhir tidak dipakai.
 */
export const HAENGBOCAKE_CONTRACT_BODY = `# PERJANJIAN KERJA WAKTU TIDAK TERTENTU

**Nomor: {nomor}/PK/HB/{tahun}**

Pada hari ini, {hari}, tanggal {tanggal} bulan {bulan} tahun {tahun}, bertempat di {kota}, yang bertanda tangan di bawah ini:

**1. Pemberi Kerja**

- Nama: {pemberi_nama}
- Jabatan: {pemberi_jabatan}
- Alamat: {pemberi_alamat}

Dalam hal ini bertindak untuk dan atas nama diri sendiri sebagai pemilik usaha Haengbocake, yang selanjutnya disebut sebagai **PIHAK PERTAMA** atau **Pemberi Kerja**.

**2. Karyawan**

- Nama: {nama}
- NIK: {nik}
- Tempat/Tanggal Lahir: {tempat_lahir}, {tgl_lahir}
- Alamat: {alamat}

Dalam hal ini bertindak untuk dan atas nama diri sendiri, yang selanjutnya disebut sebagai **PIHAK KEDUA** atau **Karyawan**.

**PIHAK PERTAMA** dan **PIHAK KEDUA** selanjutnya secara bersama-sama disebut sebagai **Para Pihak** dan secara sendiri-sendiri disebut sebagai **Pihak**.

Para Pihak terlebih dahulu menerangkan hal-hal sebagai berikut:

- bahwa Pemberi Kerja menjalankan usaha toko kue dan produk bakeri dengan merek Haengbocake;
- bahwa Pemberi Kerja membutuhkan tenaga kerja tetap dan Karyawan menyatakan bersedia bekerja pada Pemberi Kerja;
- bahwa Para Pihak memandang hubungan kerja ini sebagai kerja sama yang setara dan saling menguntungkan, yang dilandasi itikad baik, saling menghormati, serta keseimbangan antara hak dan kewajiban;
- bahwa kualitas produk, keamanan pangan, kehalalan, dan pelayanan Haengbocake bergantung pada kepatuhan terhadap Standar Operasional Prosedur yang berlaku.

Perjanjian ini disusun dengan mengacu pada:

- Undang-Undang Nomor 13 Tahun 2003 tentang Ketenagakerjaan sebagaimana telah diubah dengan Undang-Undang Nomor 6 Tahun 2023;
- Peraturan Pemerintah Nomor 35 Tahun 2021 tentang Perjanjian Kerja Waktu Tertentu, Alih Daya, Waktu Kerja dan Waktu Istirahat, dan Pemutusan Hubungan Kerja;
- Peraturan Pemerintah Nomor 36 Tahun 2021 tentang Pengupahan;
- Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.

Berdasarkan hal-hal tersebut di atas, Para Pihak sepakat untuk mengikatkan diri dalam Perjanjian Kerja (selanjutnya disebut "Perjanjian") dengan syarat dan ketentuan sebagai berikut.

---

## Pasal 1: Ketentuan Umum dan Definisi

(1) Pemberi Kerja adalah pemilik usaha Haengbocake sebagaimana diwakili oleh PIHAK PERTAMA dalam Perjanjian ini.

(2) Karyawan adalah PIHAK KEDUA yang terikat dalam hubungan kerja dengan Pemberi Kerja berdasarkan Perjanjian ini.

(3) Standar Operasional Prosedur, selanjutnya disebut SOP, adalah seluruh pedoman, prosedur, dan tata cara kerja yang ditetapkan Pemberi Kerja, termasuk kode etik, uraian tugas dan wewenang tiap jabatan, jadwal dan istirahat kerja, serta sistem pembinaan, yang diberikan kepada Karyawan secara tertulis atau melalui Zota Apps.

(4) Zota Apps adalah aplikasi internal Pemberi Kerja yang digunakan untuk absensi, pengajuan izin, rincian upah, penyampaian SOP, pengaduan, dan komunikasi kerja.

(5) Upah adalah hak Karyawan yang diterima dan dinyatakan dalam bentuk uang sebagai imbalan atas pekerjaan yang telah atau akan dilakukan.

## Pasal 2: Jabatan dan Penempatan

(1) Pemberi Kerja mengangkat Karyawan untuk menduduki posisi atau jabatan sebagai {jabatan}.

(2) Karyawan ditempatkan di Haengbocake {cabang}.

(3) Uraian tugas, tanggung jawab, dan wewenang jabatan Karyawan diatur dalam SOP dan merupakan bagian tidak terpisahkan dari Perjanjian ini.

(4) Pemberi Kerja dapat menugaskan pekerjaan lain yang sejenis atau menyesuaikan penempatan sesuai kebutuhan operasional, dengan tetap memperhatikan kemampuan Karyawan dan tanpa mengurangi hak Karyawan, yang dikomunikasikan terlebih dahulu kepada Karyawan.

## Pasal 3: Status Hubungan Kerja dan Masa Percobaan

(1) Perjanjian ini adalah Perjanjian Kerja Waktu Tidak Tertentu (PKWTT), yaitu hubungan kerja karyawan tetap, berlaku sejak Perjanjian ini ditandatangani oleh Para Pihak.

(2) Karyawan baru menjalani masa percobaan selama 1 (satu) bulan sejak tanggal mulai bekerja, dengan penilaian tertulis pada akhir masa percobaan yang disampaikan kepada Karyawan. Karyawan yang sudah bekerja sebelum Perjanjian ini tidak menjalani masa percobaan.

(3) Masa kerja Karyawan dihitung sejak tanggal mulai bekerja {tgl_mulai}, sebagaimana tercatat pada akun Zota Apps Karyawan.

## Pasal 4: Waktu Kerja dan Izin

(1) Karyawan bekerja sesuai jadwal kerja yang ditetapkan Pemberi Kerja dan diinformasikan kepada Karyawan sebelumnya.

(2) Karyawan berhak atas waktu istirahat, kesempatan beribadah, dan hari libur sesuai peraturan perundang-undangan dan SOP.

(3) Pekerjaan di luar jadwal (lembur) hanya dilakukan atas perintah atau persetujuan Pemberi Kerja atau atasan yang ditunjuk, dan dibayar sesuai peraturan perundang-undangan. Pekerjaan di luar jadwal tanpa perintah atau persetujuan tidak dihitung sebagai lembur.

(4) Kehadiran Karyawan dicatat melalui Zota Apps.

(5) Karyawan yang berhalangan hadir karena sakit atau keperluan lain wajib memberi tahu atasan langsung sebelum jam kerja dan mengajukannya melalui Zota Apps sesuai SOP. Tidak hadir tanpa kabar dan bukan izin dianggap tidak masuk kerja dan ditangani melalui Pasal 9.

## Pasal 5: Upah dan Cara Pembayaran

(1) Karyawan berhak atas upah sebesar Rp {gaji_nominal} ({gaji_terbilang} rupiah) per bulan.

(2) Komponen upah sebagaimana dimaksud pada ayat (1) terdiri atas {komponen_upah}.

(3) Karena Pemberi Kerja tergolong usaha mikro atau kecil, besaran upah ditetapkan berdasarkan kesepakatan Para Pihak dengan tetap memenuhi batas minimal yang diatur peraturan perundang-undangan bagi usaha mikro dan kecil. Bila Pemberi Kerja tidak lagi tergolong usaha mikro atau kecil, ketentuan upah minimum yang berlaku wajib diikuti.

(4) Upah dibayarkan secara {periode_bayar} paling lambat tanggal {tgl_bayar} bulan berikutnya, melalui transfer ke rekening Karyawan atau secara tunai.

(5) Rincian upah setiap bulan disampaikan kepada Karyawan melalui Zota Apps. Karyawan memeriksa rincian tersebut dan dapat menyampaikan keberatan melalui Zota Apps; Pemberi Kerja menanggapi keberatan tersebut secara terbuka.

(6) Pemotongan atas upah hanya dapat dilakukan sesuai peraturan perundang-undangan atau atas persetujuan Karyawan.

(7) Karyawan berhak atas Tunjangan Hari Raya (THR) keagamaan yang dibayarkan menjelang hari raya sesuai peraturan perundang-undangan. THR dihitung secara pro-rata berdasarkan jumlah bulan Karyawan aktif bekerja terhadap 12 (dua belas) bulan, paling banyak sebesar 1 (satu) bulan upah.

(8) Bonus atau pembayaran lain di luar upah diatur berdasarkan kebijakan tertulis atau kesepakatan antara Pemberi Kerja dan Karyawan, yang diinformasikan melalui Zota Apps.

## Pasal 6: Hak dan Kewajiban Karyawan

(1) Karyawan mempunyai hak sebagai berikut:

- menerima upah sesuai dengan Pasal 5 Perjanjian ini;
- memperoleh waktu istirahat dan hari libur sesuai dengan Pasal 4 Perjanjian ini;
- memperoleh perlakuan yang adil, lingkungan kerja yang layak dan aman, serta peralatan kerja yang memadai;
- menyampaikan pendapat, masukan, atau pengaduan sesuai dengan Pasal 10 Perjanjian ini.

(2) Karyawan mempunyai kewajiban sebagai berikut:

- melaksanakan tugas dan tanggung jawab jabatannya dengan jujur, teliti, dan profesional;
- memahami dan mematuhi SOP sebagaimana diatur dalam Pasal 7 Perjanjian ini;
- hadir dan bekerja sesuai jadwal;
- menjaga kehalalan dan keamanan pangan: tidak membawa, menyimpan, atau mengonsumsi minuman beralkohol atau bahan yang tidak sesuai standar halal Haengbocake di area usaha;
- menjaga sikap dan ucapan: tidak melakukan pelecehan, candaan bernuansa seksual, perundungan, atau kekerasan verbal maupun fisik, serta tidak menghasut, menyebarkan fitnah, atau memecah belah sesama karyawan;
- menjaga aset, peralatan, dan kebersihan tempat kerja;
- menghormati sesama karyawan, pelanggan, dan peraturan yang berlaku;
- menjaga nama baik pribadi dan Haengbocake sebagai merek.

## Pasal 7: Kepatuhan terhadap Standar Operasional Prosedur (SOP)

(1) Karyawan wajib memahami, mematuhi, dan melaksanakan SOP yang ditetapkan oleh Pemberi Kerja.

(2) Pemberi Kerja dapat memperbarui, menambah, atau menyempurnakan SOP sesuai kebutuhan operasional. Perubahan disampaikan kepada Karyawan melalui Zota Apps atau cara tertulis lain, dan Karyawan wajib menyesuaikan diri dengan SOP terbaru.

(3) Pemberi Kerja berkewajiban menyediakan akses, sosialisasi, dan pelatihan yang memadai atas SOP agar Karyawan dapat memahami dan mematuhinya.

(4) Pelanggaran terhadap SOP dikenai pembinaan dan sanksi sebagaimana diatur dalam Pasal 9 Perjanjian ini.

## Pasal 8: Hak dan Kewajiban Pemberi Kerja

(1) Pemberi Kerja mempunyai hak sebagai berikut:

- memperoleh pelaksanaan pekerjaan dari Karyawan sesuai dengan jabatan dan SOP yang berlaku;
- menetapkan, mengatur, dan mengawasi pelaksanaan pekerjaan serta jadwal kerja;
- melakukan penilaian kinerja terhadap Karyawan;
- memberikan pembinaan dan sanksi atas pelanggaran sesuai dengan Perjanjian ini.

(2) Pemberi Kerja mempunyai kewajiban sebagai berikut:

- membayar upah secara penuh dan tepat waktu sesuai dengan Pasal 5 Perjanjian ini;
- menyediakan lingkungan kerja yang layak, aman, dan suportif, serta peralatan kerja yang memadai;
- memberi kesempatan beribadah;
- menyampaikan SOP dan perubahannya kepada Karyawan;
- memperlakukan semua karyawan secara adil, termasuk dalam pemberian sanksi.

## Pasal 9: Tata Tertib dan Sanksi

(1) Pelanggaran terhadap Perjanjian, SOP, atau tata tertib ditangani melalui pembinaan dan sanksi bertahap berupa teguran, Surat Peringatan pertama (SP1), kedua (SP2), dan ketiga (SP3), sesuai sistem pembinaan dalam SOP. Tingkat sanksi disesuaikan dengan jenis, bobot, dan frekuensi pelanggaran.

(2) Atasan berwenang menegur soal pekerjaan dan melaporkan pelanggaran. Sanksi Surat Peringatan hanya dijatuhkan oleh Pemberi Kerja.

(3) Karyawan berhak didengar dan menyampaikan pembelaan sebelum sanksi ditetapkan.

(4) Pelanggaran berat, antara lain pencurian atau penggelapan, pemalsuan data atau absensi, pelecehan atau kekerasan, membocorkan rahasia usaha, atau merusak aset dengan sengaja, dapat langsung dikenai SP3 dan/atau pemutusan hubungan kerja, dengan tetap memberi kesempatan klarifikasi kepada Karyawan.

## Pasal 10: Pengaduan

(1) Pemberi Kerja menyediakan kanal pengaduan berjenjang melalui Zota Apps, termasuk pihak tepercaya alternatif untuk masalah yang menyangkut Pemberi Kerja.

(2) Pemberi Kerja menjamin tidak ada pembalasan terhadap pelapor yang beritikad baik. Pembalasan terhadap pelapor adalah pelanggaran berat.

## Pasal 11: Kerahasiaan dan Rahasia Usaha

(1) Karyawan wajib menjaga kerahasiaan informasi milik Pemberi Kerja, termasuk namun tidak terbatas pada resep, takaran, komposisi, dan teknik produksi, pemasok dan harga modal, data pelanggan, data keuangan, serta strategi usaha.

(2) Karyawan dilarang menyebarkan, menyalin, memotret, merekam, mengunggah, menjual, atau membawa keluar resep dan informasi rahasia tersebut, serta menggunakannya untuk kepentingan di luar pekerjaan, baik untuk diri sendiri maupun pihak lain, tanpa izin tertulis dari Pemberi Kerja.

(3) Kewajiban menjaga kerahasiaan sebagaimana dimaksud dalam pasal ini tetap berlaku setelah hubungan kerja berakhir.

## Pasal 12: Larangan Usaha Sejenis

(1) Selama masih bekerja pada Pemberi Kerja dan sampai dengan 12 (dua belas) bulan setelah hubungan kerja berakhir, karena alasan apa pun termasuk pengunduran diri, Karyawan dilarang membuka atau menjalankan usaha yang sama atau serupa dengan usaha Pemberi Kerja, yaitu usaha toko kue dan produk bakeri, yang berlokasi dalam radius 10 (sepuluh) kilometer dari lokasi Haengbocake {cabang} tempat Karyawan ditempatkan, baik atas nama sendiri maupun bersama atau untuk pihak lain, secara langsung maupun tidak langsung.

(2) Radius sebagaimana dimaksud pada ayat (1) diukur dalam garis lurus dari lokasi Haengbocake {cabang} tempat Karyawan ditempatkan sampai ke tempat usaha atau tempat produksi usaha tersebut, termasuk usaha yang dijalankan dari rumah.

(3) Larangan ini berlaku tanpa mengurangi kewajiban menjaga kerahasiaan dalam Pasal 11.

(4) Dalam hal Karyawan melanggar larangan ini, Pemberi Kerja berhak menuntut penghentian kegiatan usaha tersebut dan menempuh upaya hukum lain sesuai peraturan perundang-undangan.

## Pasal 13: Pemrosesan Data Pribadi

(1) Untuk keperluan hubungan kerja, Karyawan menyerahkan data pribadi berupa nama, NIK, foto Kartu Tanda Penduduk (KTP), tempat dan tanggal lahir, alamat, nomor kontak, data rekening untuk pembayaran upah, serta data yang timbul selama bekerja seperti foto dan lokasi absensi. Penyerahan foto KTP melalui Zota Apps adalah syarat penandatanganan Perjanjian ini.

(2) Pemberi Kerja memproses data tersebut hanya untuk keperluan administrasi kepegawaian, absensi, pembayaran upah, pembinaan, penegakan SOP, dan pemenuhan kewajiban hukum. Pemeriksaan otomatis atas foto absensi, jika digunakan, hanya alat bantu dan bukan satu-satunya dasar penjatuhan sanksi.

(3) Pemberi Kerja menyimpan data tersebut dengan aman, membatasi aksesnya hanya kepada pihak yang berkepentingan, dan tidak memberikannya kepada pihak lain kecuali diwajibkan peraturan perundang-undangan.

(4) Karyawan berhak mengetahui, memperbaiki, dan meminta salinan datanya. Data disimpan selama hubungan kerja berlangsung dan selama jangka waktu yang diwajibkan peraturan perundang-undangan setelahnya.

(5) Dengan menandatangani Perjanjian ini, Karyawan menyatakan setuju atas pemrosesan data pribadinya sebagaimana diatur dalam pasal ini.

## Pasal 14: Akun, PIN, dan Aset Perusahaan

(1) Karyawan wajib menjaga kerahasiaan akun Zota Apps dan PIN kasir (POS) miliknya, tidak membagikannya kepada siapa pun, tidak menggunakan akun atau PIN orang lain, dan segera melapor bila akun atau PIN diketahui orang lain. Seluruh tindakan yang tercatat melalui akun atau PIN Karyawan menjadi tanggung jawab Karyawan yang bersangkutan.

(2) Karyawan yang ditunjuk memegang kas, kunci, atau aset wajib mencatat dan mengembalikannya sesuai SOP. Kehilangan atau selisih dibahas secara terbuka dan diselesaikan dengan cara yang adil sesuai SOP.

(3) Seluruh peralatan dan aset yang disediakan Pemberi Kerja wajib digunakan sesuai peruntukannya dan dikembalikan dalam keadaan baik ketika hubungan kerja berakhir.

## Pasal 15: Berakhirnya Hubungan Kerja

(1) Pengunduran diri: Karyawan yang mengundurkan diri atas kemauan sendiri menyampaikan pemberitahuan tertulis paling lambat 30 (tiga puluh) hari sebelum tanggal pengunduran diri dan tetap melaksanakan tugas sampai tanggal tersebut. Upah yang sudah menjadi hak Karyawan atas pekerjaan yang telah dilakukan tetap dibayarkan.

(2) Karyawan yang mengundurkan diri dengan pemberitahuan kurang dari 30 (tiga puluh) hari dikenai denda sebesar 1 (satu) kali upah bulanan.

(3) Pemutusan hubungan kerja oleh Pemberi Kerja: Pemberi Kerja dapat mengakhiri hubungan kerja sesuai alasan dan prosedur yang diatur peraturan perundang-undangan, dengan pemberitahuan tertulis kepada Karyawan.

(4) Dalam hal pemutusan hubungan kerja, Karyawan berhak atas uang penghargaan masa kerja. Karena Pemberi Kerja tergolong usaha mikro atau kecil, nominalnya ditentukan berdasarkan kesepakatan Para Pihak sepanjang diizinkan peraturan perundang-undangan, dengan tetap menghargai hak Karyawan.

(5) Karyawan yang hubungan kerjanya berakhir karena pelanggaran tetap menerima hak sesuai alasan pemutusan dan peraturan perundang-undangan.

(6) Pada saat hubungan kerja berakhir, Karyawan menyelesaikan seluruh kewajibannya dan mengembalikan seluruh aset, kunci, dan akses milik Pemberi Kerja.

## Pasal 16: Penyelesaian Perselisihan

(1) Apabila terjadi perselisihan sehubungan dengan pelaksanaan Perjanjian ini, Para Pihak sepakat menyelesaikannya terlebih dahulu secara musyawarah untuk mencapai mufakat dengan dilandasi itikad baik.

(2) Apabila musyawarah tidak mencapai mufakat, perselisihan diselesaikan melalui pengadilan yang berwenang di kota atau daerah tempat Karyawan bekerja, setelah melalui tahapan penyelesaian yang diwajibkan peraturan perundang-undangan.

## Pasal 17: Ketentuan Penutup

(1) Hal-hal yang belum diatur atau belum cukup diatur dalam Perjanjian ini diatur kemudian berdasarkan kesepakatan Para Pihak dan SOP.

(2) Perubahan atau penambahan atas Perjanjian ini hanya sah dan mengikat apabila disepakati oleh Para Pihak secara tertulis, termasuk melalui tanda tangan elektronik di Zota Apps.

(3) Bila ada ketentuan Perjanjian ini yang bertentangan dengan ketentuan wajib dalam peraturan perundang-undangan, yang berlaku adalah peraturan tersebut, dan ketentuan lainnya dalam Perjanjian ini tetap berlaku.

(4) Perjanjian ini dibuat dan ditandatangani oleh Para Pihak dalam keadaan sehat jasmani dan rohani serta tanpa paksaan dari pihak manapun.

(5) Perjanjian ini ditandatangani secara elektronik melalui Zota Apps, dan salinannya dapat diunduh oleh Para Pihak. Meterai dibubuhkan sesuai ketentuan peraturan perundang-undangan.

Demikian Perjanjian ini dibuat dan ditandatangani oleh Para Pihak pada hari dan tanggal sebagaimana tersebut di atas.`;
