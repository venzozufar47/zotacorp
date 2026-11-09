-- ROLLBACK migrasi 323 → kembali ke skema produksi 2026-11-09.
-- Jalankan 324_...down.sql LEBIH DULU bila 324 sudah diterapkan.
-- Aman dijalankan berulang. Tidak menyentuh data (hanya trigger/fungsi).

begin;

drop trigger if exists payslips_guard_transitions on public.payslips;
drop function if exists public.payslips_guard_transitions();

drop trigger if exists attendance_logs_guard_decisions on public.attendance_logs;
drop function if exists public.attendance_logs_guard_decisions();

drop trigger if exists profiles_guard_lifecycle on public.profiles;
drop function if exists public.profiles_guard_lifecycle();

commit;
