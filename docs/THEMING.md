# Theming Zota App

Panduan baku warna, font, dan cakupan tema. Wajib dibaca sebelum menulis atau mengubah UI. Dokumen ini mencatat kondisi
kode yang ada, bukan rencana: kalau kode berubah, ubah dokumen ini di commit yang sama.

## Prinsip

1. **Komponen tidak tahu sedang di tema apa.** Komponen memakai nama token (`bg-primary`, `text-foreground`,
   `border-border`). Tema mengisi nilai token itu.
2. **Satu sumber nilai: `src/app/globals.css`.** Tidak ada warna "utama" yang ditulis ulang di tempat lain.
3. **Tema fitur hanya boleh menimpa token yang sama** di dalam cakupannya. Jangan membuat namespace warna paralel untuk
   hal yang sudah punya token.

## Tiga cakupan yang ada

| Cakupan | Berlaku di | Sumber | Pemasangan |
|---|---|---|---|
| **Oceanic** (default, satu-satunya tema org) | seluruh app | blok `:root` di `src/app/globals.css` | `data-theme="oceanic"` di `<html>` (`src/app/layout.tsx`). Beberapa subtree memasangnya sendiri (halaman kas, dashboard investor) agar override komponen tetap berlaku. |
| **POS** (pink) | `/pospare/*` & `/possemarang/*` | `src/components/pos/workstation.css` | `data-pos-shell data-pos-palette="pink"` di akar shell POS (`PosShell`, `POSClient`, `PosLockedScreen`). Menimpa token **yang sama** (`--primary`, `--accent`, `--background`, `--ring`, `--pop-*`, `--success`). |
| **POS Mamaya House** (burgundy + krem) | `/posmamaya/*` | `src/components/pos/workstation.css` (blok `data-pos-palette="mamaya"`) | Atribut yang sama dengan POS, nilainya dipilih `posPalette(basePath)` di `src/lib/pos/branch.ts`. Menimpa token POS ditambah permukaan krem (`--card`, `--border`, `--muted`, `--foreground`). Sengaja berbeda dari pink supaya kasir tidak tertukar saat pindah Semarang ↔ Mamaya. Logo sementara lencana "M" (`PosLogo`). |
| **Custom cake / Haengbocake** (krem + hijau) | semua halaman `/cake-orders/*` | `src/styles/haengbocake.css` | `data-haengbocake` di `src/app/cake-orders/layout.tsx`. Menimpa token standar (`--primary`, `--background`, `--foreground`, `--card`, `--border`, `--accent`, `--ring`, …) seperti POS. `--cake-*` hanya untuk arti domain. |

Tema Playful dan Minimal sudah dihapus. Jangan menghidupkannya lagi; tidak ada pengalih tema.

## Token

Didefinisikan di `:root` (nilai) dan dipetakan di blok `@theme inline` (nama utilitas Tailwind), keduanya di
`src/app/globals.css`.

| Peran | Token → utilitas | Catatan |
|---|---|---|
| Merek | `primary`, `primary-light`, `primary-dark`, `primary-foreground` | Teal "Lagoon" `#117a8c`. Di POS jadi pink. |
| Permukaan | `background`, `foreground`, `card`, `card-foreground`, `popover`, `surface`, `surface-alt` | |
| Netral | `secondary`, `muted`, `muted-foreground`, `accent`, `accent-foreground` | `muted-foreground` untuk teks sekunder. |
| Garis & fokus | `border`, `input`, `ring` | |
| Status | `destructive`, `success`, `warning` | Pakai ini, bukan merah/hijau/kuning sendiri. |
| Dekoratif | `tertiary`, `quaternary`, `pop-pink`, `pop-amber`, `pop-emerald` | Jangan dipakai untuk makna status. |
| Skala teal | `--teal-50` … `--teal-900`, `--grad-teal`, `--grad-teal-soft` | Hanya CSS variable, dipakai lewat `var(--teal-500)` di permukaan shell admin. |
| Sudut | `rounded-sm … rounded-3xl` | Diturunkan dari `--radius` (0,75rem). |
| Font | `font-sans` (Plus Jakarta Sans), `font-display` (Poppins) | Hanya dua font ini. Poppins 600/700 untuk judul. |

### Menambah token baru
Tiga langkah, semuanya wajib:
1. Tambahkan nilainya di `:root`.
2. Petakan di `@theme inline` sebagai `--color-<nama>: var(--<nama>)`.
3. Kalau tema fitur (POS) perlu nilai lain, timpa `--<nama>` di file tema itu.

Melewatkan langkah 2 tidak menimbulkan error: Tailwind v4 tidak membuat utilitasnya, sehingga `bg-warning` pernah
diam-diam tidak menghasilkan apa pun di sekitar 30 berkas.

## Aturan menulis UI

- **Warna**: pakai utilitas token (`bg-primary`, `text-muted-foreground`, `border-border`, `bg-destructive/10`). Jangan
  menulis `#rrggbb`, `rgb()`, atau warna palet Tailwind mentah (`bg-teal-600`, `text-red-500`) di komponen.
- **Komponen dasar**: pakai `src/components/ui/*` (Button, Card, Input, Select, Dialog, Badge, Table, …) dan
  `src/components/shared/PageHeader`. Gaya komponen dasar (tebal garis, bayangan, sudut) diatur satu tempat lewat
  override `[data-theme="oceanic"] [data-slot="…"]` di `globals.css`.
- **Font**: `font-sans` untuk isi, `font-display` untuk judul. Jangan impor font lain.
- **Status**: gunakan `success`, `warning`, `destructive` untuk arti status. Untuk arti domain yang khas (urgensi
  pesanan kue, kolom kanban) lihat `--cake-*`.
- **Fitur baru dengan identitas visual sendiri**: tiru pola POS, bukan pola custom cake. Buat satu file CSS kecil yang
  menimpa token yang ada di bawah selektor atribut (`[data-<fitur>]`), pasang atributnya di layout fitur itu, impor file
  CSS-nya dari layout itu. Komponen di dalamnya tetap memakai `bg-primary` dan sejenisnya.

## Pengecualian yang sah (warna boleh ditulis langsung)

- **PDF** (`@react-pdf`, mis. `PayslipPdfDocument`): tidak bisa membaca variabel CSS.
- **Template email** (`src/lib/email/*`): klien email tidak mendukung variabel CSS.
- **Grafik** (`InvestorCharts` dan sejenisnya) bila pustaka grafiknya butuh nilai literal. Ambil nilainya dari token,
  jangan mengarang.
- **`--cake-*` untuk arti domain** (bukan pengecualian warna literal, tapi satu-satunya namespace paralel yang sah):
  urgensi (terlambat/hari ini/pekan ini/jauh), kolom kanban, chip status pesanan, chip cabang Pare/Semarang, dan banner
  slip (`--cake-slip-*`) di `haengbocake.css`. Warna merek/permukaan/teks/garis di halaman itu memakai token standar.
- **Desain slip gaji** (`src/components/payslip/**`, `src/lib/payslip/**`): warnanya sengaja tetap sama di semua tema
  dan dipakai bersama PDF-nya.

## Penyimpangan yang diketahui (belum dirapikan)

Dicatat agar tidak ditiru dan bisa dibersihkan bertahap:

1. **Warna heksadesimal di komponen.** Aturan lint `no-restricted-syntax` (di `eslint.config.mjs`) memberi
   **peringatan** untuk literal `#rrggbb` di `src/**`, kecuali di pengecualian sah (PDF, email, slip gaji, grafik
   investor, tes). Saat aturan dipasang (2026-10-29) ada 115 peringatan di 32 berkas; yang terbanyak:
   `cleaning/sop/shared.tsx`, `lib/cashflow/bank-display.ts` (warna merek bank), `AttendanceLiveView.tsx`,
   `settings/LanguageCard.tsx`, `investor/HeroContract.tsx`, `cleaning/sop/SopKepatuhan.tsx`,
   `admin/scorecard/ScorecardBits.tsx`, `attendance/CheckInButton.tsx`. Hitung ulang dengan `npx eslint src`.
   Peringatan baru yang Anda tambahkan sendiri harus nol.
2. **Aturan masih peringatan, bukan error**, supaya tidak memblokir pekerjaan sampai yang lama selesai. Naikkan jadi
   `"error"` begitu jumlahnya nol.
3. **Dialog/popup (portal) di luar `[data-haengbocake]` atau `[data-pos-shell]`** dirender di akar dokumen, jadi memakai
   token Oceanic, bukan tema fiturnya. Berlaku untuk POS maupun custom cake; belum ada penanganan khusus.

## Daftar periksa sebelum commit UI

- [ ] Tidak ada warna literal baru di komponen (kecuali pengecualian sah di atas).
- [ ] Komponen dasar `ui/*` dipakai, bukan elemen HTML dengan kelas buatan sendiri.
- [ ] Dicek di cakupan tempat halaman itu hidup (dashboard = Oceanic, `/pos` = pink, `/cake-orders` = krem).
- [ ] Token baru (kalau ada) sudah dipetakan di `@theme inline`.
- [ ] Dokumen ini ikut diubah bila cakupan atau token berubah.
