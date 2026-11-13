-- Simpan apa yang DIBACA AI dari tiap selfie absen (migrasi 192 hanya menyimpan "ditolak karena X").
-- Tanpa ini, penolakan kasus batas (mis. kerudung coklat tua terbaca hitam) tidak bisa diaudit: tak ada cara tahu apakah AI
-- membaca "other" (hitam), "brown", dll. Isi: objek amatan AI, mis. {"hijabColor":"other","apron":true,"face":"full",...}.
-- NULL pada baris lama dan pada hasil "skipped"/"error".
alter table public.attendance_selfie_checks
  add column if not exists observation jsonb;

comment on column public.attendance_selfie_checks.observation is
  'Amatan mentah AI untuk foto ini (hijabColor, apron, face, dst.). NULL = tidak ada (baris lama, skipped, atau error).';
