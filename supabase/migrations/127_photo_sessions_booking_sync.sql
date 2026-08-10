-- Jumlah sesi foto Yeobo Space kini bisa ditarik otomatis dari database
-- booking yeobospace.id, bukan lagi disalin manual dari spreadsheet.
--
-- Dua kolom penjaga, masing-masing menutup satu cara sinkronisasi otomatis
-- bisa merusak data yang sudah benar:
--
-- `source` — siapa pemilik angka di sel ini. Admin masih bisa mengoreksi
-- angka lewat halaman investor, dan koreksi itu HARUS menang selamanya.
-- Begitu manusia menyentuh satu sel, sel itu jadi 'manual' dan cron tidak
-- pernah menimpanya lagi. Tanpa ini, koreksi admin akan hilang diam-diam
-- pada run berikutnya — kesalahan yang tidak akan pernah ada yang sadari
-- sampai ada investor yang bertanya.
--
-- `locked_at` — bulan yang laporannya sudah terbit. Booking yang
-- direschedule ikut memindahkan `booking_date`-nya (kolom
-- `previous_booking_date` di yeobospace membuktikan ini rutin terjadi),
-- jadi menghitung ulang bulan lama akan menggeser angka yang sudah dikirim
-- ke investor. Bulan dikunci 10 hari setelah berakhir, lalu tidak pernah
-- dihitung ulang.
--
-- Default 'manual' disengaja: SELURUH baris yang sudah ada berasal dari
-- input manusia (spreadsheet), jadi default ini membuat cron otomatis
-- tidak menyentuh satu pun data historis.

alter table public.yeobo_photo_sessions
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'booking_sync'));

alter table public.yeobo_photo_sessions
  add column if not exists locked_at timestamptz;

-- Juli 2026 adalah bulan pertama yang angkanya memang diturunkan dari
-- booking, bukan dari spreadsheet. Ditandai supaya cron masih boleh
-- mengoreksinya sampai bulan itu terkunci. Mei & Juni sengaja dibiarkan
-- 'manual' karena sumbernya spreadsheet owner.
--
-- Pada database baru pernyataan ini tidak mengubah apa pun.
update public.yeobo_photo_sessions
   set source = 'booking_sync'
 where period_year = 2026
   and period_month = 7
   and branch in ('Tlogosari', 'Tembalang', 'Jebres');

comment on column public.yeobo_photo_sessions.source is
  'manual = diinput/dikoreksi admin, kebal dari cron. booking_sync = diturunkan dari bookings yeobospace.';
comment on column public.yeobo_photo_sessions.locked_at is
  'Terisi = bulan sudah ditutup; cron tidak menghitung ulang. Admin tetap bisa mengedit manual.';
