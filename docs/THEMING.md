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
| **POS** (pink) | semua halaman `/pos/*` | `src/components/pos/workstation.css` | `data-pos-shell data-pos-palette="pink"` di akar shell POS (`PosShell`, `POSClient`, `PosLockedScreen`). Menimpa token **yang sama** (`--primary`, `--accent`, `--background`, `--ring`, `--pop-*`, `--success`). |
| **Custom cake / Haengbocake** (krem + hijau) | semua halaman `/cake-orders/*` | `src/styles/haengbocake.css` | `data-haengbocake` di `src/app/cake-orders/layout.tsx`. Mendefinisikan namespace `--cake-*` (lihat "Penyimpangan yang diketahui"). |

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
- **Tipe `--cake-*` untuk arti domain**: warna urgensi (terlambat/hari ini/pekan ini/jauh), warna kolom kanban, dan
  chip cabang Pare/Semarang di `haengbocake.css`.

## Penyimpangan yang diketahui (belum dirapikan)

Dicatat agar tidak ditiru dan bisa dibersihkan bertahap:

1. **Custom cake memakai namespace paralel.** `haengbocake.css` mendefinisikan `--cake-primary`, `--cake-bg`,
   `--cake-surface`, `--cake-fg`, `--cake-border` dan sebagainya, bukan menimpa `--primary`/`--background`/dst. Akibatnya
   komponennya campuran: sekitar 9 berkas memakai `var(--cake-*)`, sekitar 13 memakai token Tailwind biasa. Arah
   perbaikan: warna merek/permukaan/teks/garis jadi penimpa token (seperti POS); `--cake-*` hanya tinggal untuk arti
   domain di atas.
2. **Heksadesimal di komponen.** Sekitar 350 literal `#rrggbb` di `.ts/.tsx`. Sebagian pengecualian sah (PDF, email).
   Penyimpangan terbesar di luar itu: `src/components/cake/parts/SlipHero.tsx`,
   `src/components/admin/cleaning/sop/shared.tsx`, `src/components/payslip/parts/*`.
3. **Belum ada pemeriksaan otomatis.** Tidak ada aturan lint yang menolak warna literal baru, jadi aturan di atas baru
   ditegakkan lewat dokumen dan review.

Cara menghitung ulang literal: `grep -rEo "#[0-9a-fA-F]{6}\b" src --include=*.tsx --include=*.ts | cut -d: -f1 | sort | uniq -c | sort -rn`.

## Daftar periksa sebelum commit UI

- [ ] Tidak ada warna literal baru di komponen (kecuali pengecualian sah di atas).
- [ ] Komponen dasar `ui/*` dipakai, bukan elemen HTML dengan kelas buatan sendiri.
- [ ] Dicek di cakupan tempat halaman itu hidup (dashboard = Oceanic, `/pos` = pink, `/cake-orders` = krem).
- [ ] Token baru (kalau ada) sudah dipetakan di `@theme inline`.
- [ ] Dokumen ini ikut diubah bila cakupan atau token berubah.
