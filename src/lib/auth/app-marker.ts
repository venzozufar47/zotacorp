/**
 * Penanda asal akun, disisipkan ke `raw_user_meta_data` setiap kali aplikasi
 * ini membuat user di Supabase Auth.
 *
 * KENAPA ADA: database yeobospace.id dipindahkan ke project Supabase yang sama
 * dengan aplikasi ini (schema `yeobo`). Konsekuensinya tabel `auth.users`
 * dipakai BERSAMA — karyawan/investor Zota dan pelanggan publik yeobospace
 * duduk di kolam yang sama.
 *
 * Trigger `yeobo.handle_new_user` membuatkan profil pelanggan untuk setiap user
 * baru. Tanpa penanda ini, karyawan yang dibuat admin ikut mendapat profil
 * pelanggan di yeobospace. Trigger itu memeriksa penanda ini dan melewati user
 * yang membawanya.
 *
 * KENAPA PENANDA INI BOLEH DIPERCAYA — dan kenapa arahnya harus begini:
 * aplikasi ini TIDAK punya pendaftaran mandiri. Nol pemanggilan `signUp()`;
 * setiap user lahir dari service_role di tiga tempat (dua rute createUser dan
 * satu generateLink invite). Jadi tidak ada klien yang bisa memalsukannya.
 *
 * Kebalikannya TIDAK aman: menandai sisi yeobospace mustahil, karena
 * pendaftaran Google lewat `signInWithOAuth()` tidak menerima metadata kustom —
 * metadata user OAuth diisi oleh Google. Pelanggan Google karena itu akan lolos
 * dari filter apa pun yang bertumpu pada penanda di sisi mereka. Penanda harus
 * dipasang di sisi yang terkendali penuh, lalu yang lain dianggap pelanggan.
 *
 * JANGAN pakai untuk keputusan otorisasi. Ini penanda asal, bukan klaim hak.
 * Otorisasi tetap bertumpu pada baris `public.profiles` dan fungsi `is_admin()`.
 */
export const APP_MARKER = { app: "zota" } as const;
