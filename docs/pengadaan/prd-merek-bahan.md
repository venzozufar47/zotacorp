# PRD — Merek Bahan di Pengadaan (pelacakan merek dibeli & digunakan, siap Daftar Bahan Halal)

Status: **usulan, menunggu keputusan owner** · 29 Okt 2026 · cakupan: Haengbocake Pare & Semarang (Yeobo tidak memakai bahan baku)

## 1. Tujuan

1. Mencatat **merek apa** yang dibeli dan sedang dipakai untuk tiap bahan baku, tanpa menambah pekerjaan berarti bagi petugas.
2. Menjadi sumber data **Daftar Bahan Halal** (Lampiran 5, format pada tangkapan layar owner): satu tombol ekspor, bukan menyusun manual.
3. Tetap sederhana: **merek opsional**, didaftarkan oleh staf pengadaan, dan input merek menjadi bagian dari alur nota belanja yang sudah ada, bukan layar baru.

Bukan tujuan: membuat modul halal lengkap (audit, SOP, pelatihan), melacak lot/kedaluwarsa per batch, atau mengubah cara hitung stok dan harga.

## 2. Kondisi sistem sekarang (hasil audit kode & database)

| Hal | Fakta |
| --- | --- |
| Master bahan | `costing_materials`: 233 bahan aktif (Pare 126, Semarang 106). Punya `category`, satuan beli/pakai, harga acuan, status tinjau (`review_status`: pending/approved). Tidak ada kolom merek, produsen, atau halal. |
| Nota belanja | `procurement_purchases` (foto nota, vendor, sumber uang) + `procurement_purchase_lines` (baris `bahan` atau `lain`). Per baris bahan sistem menulis buku kas, **barang masuk** (`costing_material_receipts`), dan memperbarui harga acuan (rata-rata tertimbang). 76 nota, 81 baris, 43 barang masuk. |
| Barang masuk langsung | `recordGoodsIn` / `GoodsInDialog` mencatat penerimaan tanpa nota. |
| "Digunakan" | Tidak dicatat langsung. Pemakaian bahan **teoretis** = produksi POS × resep (`src/lib/procurement/usage.ts`); stok = estimasi (barang masuk − pemakaian, dikoreksi opname). Satu kolam stok per bahan, **tanpa lot**. |
| Vendor | Ada di kepala nota (`vendor`) dan `receipts.supplier`, tetapi **kosong di 48 dari 76 nota**. Supplier untuk Lampiran 5 harus diambil dari sini, jadi pengisian vendor perlu didorong. |
| Bahan baru | `proposeMaterial` dari form nota: langsung bisa dipakai, status `pending` sampai admin meninjau; ada deteksi nama mirip (`similar-materials.ts`). Pola yang sama dipakai untuk merek. |
| Audit | `costing_material_changes` (log perubahan + tombol "tandai dilihat" dan "urungkan" untuk owner) dipakai lagi untuk perubahan merek/halal. |
| Akses | Petugas pengadaan per cabang = `procurement_assignments`; gerbang `requireProcurementForBu`. Kasir hanya form catat. Admin = `profiles.role = 'admin'`. |
| Kategori bahan | Makanan: Susu & Lemak, Tepung & Pati, Pengembang/Perisa/Garam, Topping & Isian, Coklat & Kakao, Gula & Pemanis, Buah & Kacang, Minuman, Telur, Bahan Setengah Jadi. Non-makanan: **Kemasan & Label** (41 + 33), **Perlengkapan Saji** (5 + 4). 16 bahan Pare belum berkategori. |

Perkiraan beban pendaftaran: sekitar 150 bahan makanan, jadi kira-kira 150–250 merek. Tidak boleh diisi sekaligus. Urutannya mengikuti kelas ABC pemakaian yang sudah ada (bahan paling banyak dipakai dulu).

## 3. Prinsip desain ("tidak ribet")

1. **Merek opsional.** Baris nota tanpa merek tetap valid, tersimpan sebagai "Tanpa merek", tidak ada peringatan menghalangi.
2. **Nol langkah tambahan di jalur normal.** Di baris bahan, merek terakhir yang dipakai untuk bahan itu **sudah terpilih**. Membeli merek yang sama = tidak mengetik apa-apa.
3. **Daftar merek per bahan, pendaftaran oleh staf pengadaan.** Dari form nota cukup mengetik **nama merek** (satu kolom). Data halal (produsen, negara, sertifikat) dilengkapi belakangan di tab Bahan; tidak pernah menahan penyimpanan nota.
4. **Tanpa persetujuan berlapis.** Merek baru langsung bisa dipakai. Owner cukup melihatnya di umpan perubahan yang sudah ada (bisa diurungkan), sama seperti bahan baru.
5. **Satu tempat kerja.** Tidak ada menu baru untuk petugas: merek hidup di tab **Catat belanja**, **Bahan**, **Stok**, dan **Riwayat** yang sudah ada.

## 4. Pengguna & izin

| Peran | Boleh |
| --- | --- |
| Petugas pengadaan (cabang yang dipegang) | Pilih merek di nota/barang masuk; daftar merek baru; lengkapi data halal; ganti merek yang sedang dipakai; unduh Daftar Bahan Halal cabangnya. |
| Kasir/asisten POS (akun terbatas) | Tidak melihat merek (form nota terbatas tidak berubah). |
| Admin/owner | Semua hal di atas untuk semua cabang; mengisi profil halal (nama usaha, tempat, pemilik, penyelia halal); melihat peringatan sertifikat; mengurungkan perubahan lewat umpan perubahan. |

## 5. Alur pengguna

**A. Catat belanja (jalur utama).** Baris bahan memiliki satu pilihan tambahan **Merek** di bawah nama bahan, berbentuk chip: `[merek terakhir ✓] [merek lain…] [Tanpa merek] [+ Merek baru]`. Bahan yang belum punya merek terdaftar tampil dengan chip `Tanpa merek` terpilih dan tautan kecil `+ Tambah merek`. Menyimpan nota menulis merek ke baris nota **dan** ke barang masuk.

**B. Merek baru saat belanja.** `+ Merek baru` membuka satu kolom nama (saran: pemeriksa nama mirip, mis. "Segitiga Biru" vs "segitiga biru"). Simpan = merek terdaftar dengan status halal `Belum dicek`. Produsen dan negara bisa diisi opsional di sini, tetapi tidak wajib.

**C. Barang tanpa merek.** Tidak memilih merek apa pun. Laporan menghitungnya sebagai "tanpa merek" dan daftar halal menampilkannya di bagian *perlu dilengkapi* (tidak mengganggu).

**D. Lengkapi data halal (tab Bahan → detail bahan → bagian Merek).** Daftar merek bahan itu, tiap merek bisa dibuka: produsen, negara, **status halal** (`Bersertifikat` / `Tidak wajib (positive list)` / `Belum dicek`), lembaga penerbit, nomor sertifikat, masa berlaku, foto atau PDF sertifikat. Bagian ini muncul sebagai antrean **"Perlu dilengkapi (N)"** di atas tab Bahan, urut menurut kelas ABC pemakaian.

**E. Merek yang sedang dipakai.** Tiap bahan punya satu merek **aktif** (lihat bagian 8). Tab Stok menampilkan `Dipakai: Segitiga Biru` dan satu ketukan `Ganti merek dipakai` bila merek lain mulai dipakai lebih awal atau lebih lambat dari perkiraan sistem.

**F. Ekspor Daftar Bahan Halal.** Tab Bahan → tombol `Unduh daftar bahan halal` (xlsx; PDF menyusul). Pilihan periode: **"Sedang dipakai sekarang"** (bawaan) atau rentang tanggal (merek yang aktif pada rentang itu). Format kolom sesuai Lampiran 5 (bagian 9).

**G. Pengingat.** Sertifikat yang habis dalam 60 hari atau sudah lewat, serta merek aktif berstatus `Belum dicek`, muncul sebagai satu kartu di beranda petugas/owner (memakai badge pengadaan yang sudah ada) dan satu notifikasi push ringkas ke owner per minggu.

## 6. Model data (usulan)

Tabel baru memerlukan **GRANT eksplisit** (anon/authenticated/service_role) karena aturan Supabase mulai 30 Okt 2026, dan RLS aktif dengan gerbang yang sama dengan bahan.

```sql
-- Merek terdaftar per bahan.
create table public.costing_material_brands (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.costing_materials(id) on delete restrict,
  business_unit text not null,               -- sama dengan bahan; dipakai gerbang akses
  name text not null,                        -- "Segitiga Biru"
  producer text, country text,
  halal_status text not null default 'belum_dicek'
    check (halal_status in ('bersertifikat','tidak_wajib','belum_dicek')),
  halal_issuer text, halal_cert_no text, halal_valid_until date,
  halal_doc_path text,                       -- foto/PDF di bucket penyimpanan
  halal_note text,                           -- mis. keterangan positive list
  is_active boolean not null default true,   -- merek berhenti dipakai: nonaktif, TIDAK dihapus (riwayat)
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index on public.costing_material_brands (material_id, lower(name));

-- Riwayat merek yang dipakai (menjawab "bulan X memakai merek apa").
create table public.costing_material_brand_usage (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.costing_materials(id),
  brand_id uuid not null references public.costing_material_brands(id),
  started_on date not null, ended_on date,   -- null = sedang dipakai
  source text not null default 'auto'        -- 'auto' (dari barang masuk) | 'manual' (ketukan petugas)
);
create unique index on public.costing_material_brand_usage (material_id) where ended_on is null;

-- Penautan ke alur yang sudah ada.
alter table public.procurement_purchase_lines add column brand_id uuid references public.costing_material_brands(id);
alter table public.costing_material_receipts   add column brand_id uuid references public.costing_material_brands(id);
alter table public.costing_materials
  add column halal_kind text check (halal_kind in ('baku','tambahan','penolong')),  -- "Jenis Bahan" Lampiran 5
  add column in_halal_list boolean;          -- null = ikut bawaan kategori; kemasan & perlengkapan saji bawaannya keluar

-- Kop dokumen Lampiran 5, satu baris per cabang (hanya admin yang mengisi).
create table public.procurement_halal_profiles (
  business_unit text primary key,
  business_name text, place text, owner_name text, halal_supervisor_name text, updated_at timestamptz default now()
);
```

Catatan: `brand_id` pada baris nota dan barang masuk **nullable**, jadi seluruh data lama tetap valid tanpa backfill. Satu merek hanya punya satu bahan (merek yang sama di Pare dan Semarang terdaftar dua kali; tombol `Salin ke cabang lain` mengurangi ketikan ulang).

## 7. Perubahan pada sistem yang ada (sinkronisasi)

| Bagian | Perubahan |
| --- | --- |
| `PurchaseLineInput` (`kind: "bahan"`) | Tambah `brandId?: string \| null` dan `newBrandName?: string` (merek baru dibuat di server dalam transaksi yang sama dengan nota, bukan lewat panggilan terpisah). |
| `createPurchaseImpl` | Menulis `brand_id` ke baris nota dan ke `costing_material_receipts`; memperbarui riwayat merek aktif (bagian 8). Mode edit (`replaceId`) ikut membalik dan menulis ulang karena snapshot lama sudah menyalin seluruh baris. Rollback mencakup merek yang baru dibuat oleh nota yang gagal. |
| `recordGoodsIn`, `GoodsInDialog` | Pemilih merek yang sama (satu chip, bawaan merek terakhir). |
| `proposeMaterial` | Tetap. Bahan baru lahir tanpa merek; merek ditambah lewat chip. |
| Aksi baru | `registerBrand`, `updateBrand` (halal), `setActiveBrand`, `listBrandsNeedingInfo`, `exportHalalList` di berkas aksi baru `procurement-brands.actions.ts`, semua di balik `requireProcurementForBu` (pola `proposeMaterial`). |
| `listMaterialDetails` / `MaterialDetail` | Sertakan merek, merek aktif, dan hitungan "perlu dilengkapi". |
| `PurchaseForm.tsx` | Chip merek di baris bahan. Peringatan harga (`price_flag`) menyebut merek bila harga berubah karena berganti merek. |
| `PurchaseHistory.tsx`, edit nota | Nama merek tampil di baris; edit nota bisa mengganti merek. |
| `MaterialsManager.tsx` (tab Bahan) | Bagian **Merek** di detail bahan, antrean "Perlu dilengkapi", tombol ekspor. Bahan "Kemasan & Label" tidak menampilkan antrean halal. |
| Tab Stok / `ProcurementBoard.tsx` | Baris `Dipakai: <merek>` dan tombol `Ganti merek dipakai`. |
| `costing_material_changes` | Perubahan merek/halal masuk umpan ini; perubahan nomor atau masa berlaku sertifikat ditandai `sensitive` agar owner melihatnya. |
| `getProcurementDashboardBadge` | Tambah hitungan sertifikat habis/hampir habis dan merek aktif `Belum dicek`. |
| Penyimpanan berkas | Foto/PDF sertifikat memakai bucket dan kompresi gambar yang sudah ada (batas 5 MB, JPEG/PNG/WebP/PDF). Perhatikan egress: gambar dikompres saat unggah. |

Tidak berubah: perhitungan harga acuan (rata-rata tertimbang per **bahan**), buku kas, kategori laporan, resep dan HPP, rumus stok dan opname.

## 8. "Dibeli" vs "digunakan"

- **Dibeli**: fakta langsung, tiap baris nota atau barang masuk membawa merek.
- **Digunakan**: sistem tidak tahu merek mana yang fisik dipakai karena stok satu kolam. Definisi v1 yang sederhana tetapi jujur: **merek aktif = merek pada barang masuk terbaru**, dengan tanggal mulai dan akhir tersimpan di `costing_material_brand_usage`.
  - Saat barang masuk dengan merek berbeda dari merek aktif, merek baru langsung menjadi aktif dan merek lama ditutup di tanggal itu (`source = 'auto'`).
  - Bila petugas tahu stok lama masih dipakai, satu ketukan `Ganti merek dipakai` di tab Stok mengoreksi (`source = 'manual'`) dengan tanggal mulai yang bisa diubah.
  - Lampiran 5 mencantumkan merek yang aktif pada periode pilihan.
- **v2 (di luar PRD ini)**: kuantitas per merek lewat urutan FIFO dari barang masuk dan pemakaian teoretis (`usage.ts`). Baru dikerjakan bila owner butuh angka kuantitas per merek.

## 9. Pemetaan Lampiran 5 → data

| Kolom Lampiran 5 | Sumber |
| --- | --- |
| No | urutan |
| Nama dan Merek | `costing_materials.name` + `brand.name` (mis. "Tepung terigu — Segitiga Biru") |
| Jenis Bahan (*) | `costing_materials.halal_kind` (baku / tambahan / penolong) |
| Produsen | `brand.producer` |
| Negara | `brand.country` |
| Supplier | `vendor` pada nota terbaru yang memuat merek itu (`receipts.supplier` bila ada) |
| Lembaga Penerbit Sertifikat Halal | `brand.halal_issuer` |
| Nomor Sertifikat Halal | `brand.halal_cert_no` |
| Masa Berlaku | `brand.halal_valid_until` |
| Dokumen Pendukung | tautan berkas sertifikat, atau teks "Positive list" + `halal_note` bila status `tidak_wajib` |
| Kop (nama usaha), "Ditetapkan di", Pemilik Usaha, Penyelia Halal | `procurement_halal_profiles` + tanggal unduh |

Baris tanpa merek atau berstatus `belum_dicek` tetap muncul di berkas dengan sel kosong yang disorot, supaya jelas apa yang masih kurang. Isi daftar mengikuti bahan yang `in_halal_list` (kemasan dan perlengkapan saji bawaannya keluar, bisa dimasukkan per bahan).

## 10. Aturan & kasus tepi

- Nama merek unik per bahan tanpa membedakan huruf besar/kecil; nama mirip memunculkan saran, bukan blokir.
- Merek tidak bisa dihapus bila sudah dipakai di nota atau barang masuk; hanya dinonaktifkan. Merek nonaktif tidak muncul di chip tetapi tetap tampil di riwayat dan ekspor periode lalu.
- Menghapus atau mengedit nota membalik penautan merek bersama baris lainnya; riwayat merek aktif dihitung ulang dari barang masuk yang tersisa.
- Bahan dinonaktifkan: mereknya ikut tersembunyi dari daftar halal "sekarang", tetap ada untuk periode lalu.
- Sertifikat `bersertifikat` tanpa nomor/lembaga/masa berlaku tidak diblokir, tetapi tercatat **tidak lengkap** dan masuk antrean.
- Nota susulan (maks. 7 hari ke belakang, aturan yang sudah ada) memakai tanggal nota untuk riwayat merek aktif.
- Merek di nota hanya untuk baris `bahan`; baris `lain` tidak punya merek.

## 11. Kriteria penerimaan

1. Membuat nota dengan satu bahan tanpa menyentuh pemilih merek menghasilkan nota valid dan merek sama dengan pembelian terakhir (atau tanpa merek bila belum ada), **tanpa ketukan tambahan**.
2. Menambah merek baru dari baris nota membutuhkan **satu kolom nama**; nota gagal tersimpan tidak meninggalkan merek yatim.
3. Edit nota yang mengganti merek: barang masuk, baris nota, dan merek aktif konsisten; buku kas dan harga acuan tidak berubah karena merek.
4. Antrean "Perlu dilengkapi" berurut menurut kelas ABC dan menyusut saat data halal dilengkapi.
5. Unduhan xlsx memuat kolom Lampiran 5 persis berurutan, kop terisi dari profil, dan sel kosong tersorot.
6. Akun kasir tidak melihat merek; petugas hanya melihat merek cabang yang dipegangnya.
7. Seluruh 76 nota lama tetap terbuka dan dapat diedit tanpa merek.

## 12. Metrik keberhasilan

- ≥ 80% baris bahan baru memiliki merek dalam 30 hari setelah rilis (tanpa memaksa).
- ≥ 90% merek aktif **kelas A** berstatus bukan `belum_dicek` dalam 60 hari.
- Waktu menyiapkan Daftar Bahan Halal: dari manual menjadi satu unduhan.
- Pengisian vendor di nota naik dari 37% menjadi ≥ 80% (dibutuhkan kolom Supplier).

## 13. Di luar cakupan

Lot dan tanggal kedaluwarsa per batch, kuantitas per merek (v2), pengajuan sertifikasi ke BPJPH, pemindai barcode/OCR kemasan, modul Yeobo, serta perubahan resep atau HPP.

## 14. Keputusan terbuka (rekomendasi saya di depan)

1. **Definisi "digunakan" v1**: merek pada barang masuk terbaru, dengan koreksi satu ketukan (rekomendasi), atau langsung FIFO kuantitatif.
2. **Vendor di nota**: dijadikan **terisi otomatis dari vendor terakhir bahan itu** (rekomendasi) agar Supplier Lampiran 5 tidak kosong, atau dibiarkan opsional seperti sekarang.
3. **Bahan alami tak berisiko** (telur, gula pasir, buah segar): tanda `Tidak wajib (positive list)` diisi cepat dengan satu ketukan, daftar bahan yang dianggap ini disepakati dengan penyelia halal.
4. **Kemasan** (kotak kue, plastik, kertas roti): bawaan keluar dari Daftar Halal (rekomendasi). Konfirmasi dengan penyelia halal apakah kemasan kontak langsung perlu masuk.
5. **Siapa penyelia halal** dan nama pemilik usaha untuk kop dokumen per cabang.
6. **Format ekspor**: xlsx dulu (mudah disunting untuk unggahan), PDF menyusul bila dibutuhkan.

## 15. Fase

| Fase | Isi | Hasil |
| --- | --- | --- |
| 1 | Migrasi tabel/kolom; aksi merek; chip merek di form nota dan barang masuk; merek di riwayat | Merek tercatat saat belanja |
| 2 | Bagian Merek di tab Bahan, data halal, antrean "Perlu dilengkapi", unggah sertifikat | Data halal terkumpul bertahap |
| 3 | Merek aktif + `Ganti merek dipakai` di tab Stok; ekspor Lampiran 5 xlsx; profil halal; kartu pengingat | Daftar Bahan Halal sekali unduh |
| 4 (opsional) | FIFO kuantitas per merek, ekspor PDF | Sesuai kebutuhan audit |

Fase 1 sendiri sudah memberikan nilai dan tidak mengubah alur yang berjalan; fase 2–3 bisa dikerjakan bersamaan setelah keputusan nomor 1–4 di atas.
