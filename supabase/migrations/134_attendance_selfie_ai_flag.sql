-- Flag anomali foto selfie check-in via Gemini (2026-08-20).
--
-- LATAR. Selfie check-in sudah wajib sejak awal (`attendance_logs.selfie_path`,
-- lihat migrasi 011), tapi tidak ada apa pun yang memeriksa ISI-nya — kalau
-- kameranya gagal / kepencet dan yang ter-upload foto hitam atau bukan wajah,
-- itu baru ketahuan kalau admin kebetulan membuka fotonya manual. Gemini
-- dipakai untuk memberi TANDA, bukan MEMUTUSKAN — check-in tetap sukses apa
-- pun hasilnya, admin yang menilai.
--
-- KENAPA ASYNC, BUKAN BAGIAN DARI VALIDASI check-in: check-in dipakai SEMUA
-- karyawan tiap hari kerja. Kalau pemeriksaan foto ini disisipkan ke jalur
-- checkIn() dan Gemini lambat/limit/down, seluruh proses absen ikut macet.
-- Jadi ditulis lewat `after()` — respons check-in sudah balik ke klien
-- sebelum panggilan Gemini bahkan mulai. Nol kemungkinan foto anomali
-- membatalkan absen yang sah.
--
-- Dua kolom saja: `flag` untuk filter/badge cepat, `note` alasan singkat
-- untuk ditampilkan admin. Tidak ada kolom "checked_at" — NULL pada `flag`
-- sudah cukup berarti "belum/gagal diperiksa", dan tidak ada UI yang perlu
-- membedakan "belum sempat" dari "sengaja dilewati".

alter table public.attendance_logs
  add column if not exists selfie_ai_flag text,
  add column if not exists selfie_ai_note text;

do $$ begin
  alter table public.attendance_logs
    add constraint attendance_logs_selfie_ai_flag_check
    check (selfie_ai_flag is null or selfie_ai_flag in ('ok', 'anomaly'));
exception when duplicate_object then null; end $$;

comment on column public.attendance_logs.selfie_ai_flag is
  'Hasil pemeriksaan Gemini atas selfie check-in: ok | anomaly | null '
  '(belum diperiksa — foto belum ada, atau panggilan API gagal/timeout). '
  'TIDAK PERNAH menggagalkan atau mengunci check-in; murni penanda untuk '
  'admin. Diisi async lewat after() setelah checkIn() selesai merespons.';

comment on column public.attendance_logs.selfie_ai_note is
  'Alasan singkat dari Gemini (bahasa Indonesia, maks ~15 kata) kenapa '
  'foto ditandai anomaly. Null kalau flag ok atau belum diperiksa.';
