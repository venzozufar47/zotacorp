-- Karyawan-submitted reason text yang dilampirkan saat upload bukti
-- telat. Beda dari `late_proof_admin_note` (yang dipakai admin saat
-- reject untuk kasih alasan penolakan). Field ini tampil di slip gaji
-- karyawan kalau hari telat di-excuse, supaya transparan kenapa.
alter table public.attendance_logs
  add column if not exists late_proof_reason text;
