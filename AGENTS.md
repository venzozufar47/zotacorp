<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:theming-rules -->
# Tema & warna UI

Sebelum menulis atau mengubah UI, baca [`docs/THEMING.md`](docs/THEMING.md): tiga cakupan tema (Oceanic, POS, custom cake), daftar token, aturan "jangan menulis warna literal di komponen", dan cara menambah token (wajib dipetakan di `@theme inline`).
<!-- END:theming-rules -->

# Backup

Tabel baru di skema `public` dan `yeobo` otomatis ikut backup (`src/lib/backups/dynamic.ts`) dan wajib punya primary key. Tambahkan ke daftar kecuali hanya bila isinya data sementara atau rahasia. Skema baru tidak ikut otomatis.

# Query Supabase

Buat klien hanya lewat `src/lib/supabase/factory.ts` (ditegakkan ESLint). Klien itu mengambil halaman sisa otomatis, karena Data API memotong di 1.000 baris tanpa galat. Relasi tertanam (`select("*, anak(*)")`) tidak tercakup: bila satu induk bisa punya lebih dari 1.000 anak, query tabel anaknya langsung.
