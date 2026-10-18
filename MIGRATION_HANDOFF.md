# Handoff: terapkan migrasi 195–206 ke Supabase `zota-app`

Ditulis karena `mcp__Supabase__apply_migration` di sesi sebelumnya timeout
berulang kali (60s) pada migrasi pertama (`195_cash_closings`) — belum jelas
apakah itu murni masalah transport MCP atau sesuatu di server. Tabelnya
sendiri **belum pernah berhasil terbuat** (sudah diverifikasi via
`execute_sql` ke `information_schema.tables` setiap kali sebelum retry).

User secara eksplisit minta hati-hati dengan aksi yang tidak bisa dibalik —
baca catatan "PENTING" di bawah sebelum mulai.

## Target project

- Project: **zota-app**
- `project_id`: `lzhplabqgbstttutftry`
- Region: ap-southeast-1
- Kalau ragu, konfirmasi ulang lewat `mcp__Supabase__list_projects` —
  harus match nama `zota-app`, JANGAN pakai project lain (`SatuTuju`) yang
  juga ada di akun ini.

## Yang harus dilakukan

Terapkan 12 file migrasi di `supabase/migrations/195_*.sql` sampai
`206_*.sql`, **urut dari 195 ke 206** (ada dependensi antar tabel/kolom),
masing-masing lewat `mcp__Supabase__apply_migration` dengan:
- `project_id`: `lzhplabqgbstttutftry`
- `name`: nama file tanpa ekstensi `.sql` (contoh: `195_cash_closings`)
- `query`: isi file tersebut persis (baca dulu filenya, jangan ditulis ulang dari ingatan)

Daftar filenya + fitur apa yang dia dukung (semua fitur sudah ada di kode,
sudah commit — migrasi ini cuma menyusulkan skema DB-nya):

| # | File | Fitur |
|---|------|-------|
| 195 | `195_cash_closings.sql` | Tutup Kas Harian |
| 196 | `196_leave_requests.sql` | Izin Sakit & Izin Keluar Toko |
| 197 | `197_coaching_notes_sp_system.sql` | Sistem SP digital (meluaskan tabel `employee_coaching_notes` yang sudah ada) |
| 198 | `198_team_huddles_and_minutes.sql` | Notulen Huddle & Rapat Mingguan |
| 199 | `199_customer_complaints.sql` | Log Keluhan & Insiden Pelanggan |
| 200 | `200_approval_requests.sql` | Log Permintaan Persetujuan & Daftar Tertahan |
| 201 | `201_hr_grievances.sql` | Kanal Pengaduan HR |
| 202 | `202_monthly_pulse_survey.sql` | Survei Bulanan Anonim |
| 203 | `203_bonus_calculator.sql` | Kalkulator Bonus Tim |
| 204 | `204_product_rnd_and_testers.sql` | Log Riset Produk & Daftar Tester |
| 205 | `205_offboarding_checklists.sql` | Checklist Offboarding |
| 206 | `206_sop_acknowledgments.sql` | Pengakuan SOP Digital |

Semuanya murni **aditif** — cuma `create table` baru + RLS + grant
`service_role`, tidak ada `drop`/`alter` yang menyentuh tabel lama (kecuali
`197` yang nambah kolom ke `employee_coaching_notes`, juga aditif, bukan
destruktif). Tidak ada migrasi yang menghapus/mengubah data lama.

## PENTING — soal timeout

1. **Sebelum retry migrasi mana pun setelah timeout**, cek dulu apakah dia
   sebenarnya SUDAH berhasil, jangan asal kirim ulang:
   - `mcp__Supabase__list_migrations` → cari apakah versinya sudah muncul, ATAU
   - `mcp__Supabase__execute_sql` dengan query seperti:
     ```sql
     select table_name from information_schema.tables
     where table_schema = 'public' and table_name in ('<tabel1>', '<tabel2>');
     ```
   - Kalau tabelnya ternyata SUDAH ada tapi migration historynya tidak
     tercatat, JANGAN kirim ulang `create table` yang sama (bakal error
     "already exists"). Lapor ke user, jangan di-drop/recreate sendiri.
2. Kalau timeout tapi tabel benar-benar belum ada (confirmed kosong),
   retry aman — `create table` belum tercommit.
3. Kalau sampai 3× timeout berturut-turut tanpa progres, STOP, jangan terus
   coba-coba — lapor balik ke user, biarkan dia memutuskan (mungkin perlu
   pakai Supabase dashboard/CLI manual alih-alih MCP).

## Setelah 12 migrasi berhasil

1. Jalankan `mcp__Supabase__get_advisors` dengan `type: "security"` — pastikan
   tidak ada temuan baru yang mengkhawatirkan dari tabel-tabel baru ini
   (semua sudah didesain RLS admin-only + service-role grant, jadi
   seharusnya bersih).
2. Jalankan `mcp__Supabase__generate_typescript_types` dan tulis hasilnya ke
   `src/lib/supabase/types.ts` (replace isi file, bukan append).
3. **JANGAN** `git add`/`commit`/`push` apa pun — user sudah minta eksplisit
   "no push until i say so" di sesi sebelumnya, dan belum ada instruksi baru
   soal commit `types.ts`. Biarkan sebagai working-tree change, lapor ke
   user apa yang berubah, biar dia yang putuskan commit/push-nya.
4. Hapus file `MIGRATION_HANDOFF.md` ini setelah selesai, atau biarkan saja
   kalau user mau simpan sebagai riwayat — tidak masuk ke git kalau tidak
   di-`git add`.

## Hasil akhir yang diharapkan

- `mcp__Supabase__list_migrations` menampilkan 12 versi baru (195–206).
- 12 tabel baru (+ tabel turunan seperti `cash_closing_petty_expenses`,
  `sop_document_acknowledgments`, dll — lihat isi tiap file) muncul di
  `information_schema.tables`.
- `src/lib/supabase/types.ts` ter-update, belum di-commit.
- Tidak ada `git push` yang terjadi.
