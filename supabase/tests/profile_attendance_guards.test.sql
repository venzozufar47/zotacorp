-- Tes keadaan akhir migrasi 323 + 324 (docs/STATE_MACHINES.md SM-1, SM-6, SM-7),
-- termasuk matriks kompatibilitas: jalur yang DIPAKAI aplikasi harus tetap
-- jalan (karyawan: data diri, avatar, PIN, tanggapan slip, onboarding;
-- service role: check-in/out, istirahat, lembur, streak; admin: semua).
--
-- Butuh data dari supabase/tests/env/seed.sql — jalankan lewat
-- `node supabase/tests/run-db-tests.mjs` (Postgres lokal). JANGAN di produksi.
-- Satu transaksi, di-ROLLBACK di akhir; kegagalan = exception "FAIL: ...".

begin;

-- q harus diblokir: error izin (42501, termasuk pelanggaran RLS) ATAU 0 baris (RLS menyembunyikan baris).
create function pg_temp.expect_blocked(label text, q text) returns void language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  if n > 0 then raise exception 'FAIL: % — lolos (% baris)', label, n; end if;
exception when insufficient_privilege then null;
end $$;

create function pg_temp.expect_rows(label text, q text, want int default 1) returns void language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  if n <> want then raise exception 'FAIL: % — % baris, harusnya %', label, n, want; end if;
end $$;

create function pg_temp.expect_error(label text, q text, state text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'FAIL: % — tidak ditolak', label;
exception when others then
  if sqlstate <> state then raise exception 'FAIL: % — sqlstate %, harusnya % (%)', label, sqlstate, state, sqlerrm; end if;
end $$;

grant execute on function pg_temp.expect_blocked(text, text), pg_temp.expect_rows(text, text, int), pg_temp.expect_error(text, text, text) to authenticated, service_role;

-- Satu sesi istirahat terbuka milik karyawan lama (ditulis server).
insert into public.attendance_break_logs (id, attendance_log_id, user_id, date, window_start, window_end, break_out_at)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1',
        '00000000-0000-4000-8000-0000000000e1', date '2099-02-01', '12:00', '13:00', now());

-- ══ Karyawan lama (e1) ═════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;

-- SM-7: kolom hitungan absensi tidak bisa ditulis langsung.
select pg_temp.expect_blocked('insert absensi sendiri',
  $q$insert into public.attendance_logs (user_id, date, checked_in_at, status) values (auth.uid(), date '2099-03-01', now() - interval '3 hour', 'on_time')$q$);
select pg_temp.expect_blocked('ubah jam masuk', $q$update public.attendance_logs set checked_in_at = checked_in_at - interval '1 hour' where id = '00000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.expect_blocked('ubah status/menit telat', $q$update public.attendance_logs set status = 'on_time', late_minutes = 0 where id = '00000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.expect_blocked('isi jam pulang sendiri', $q$update public.attendance_logs set checked_out_at = now() + interval '5 hour' where id = '00000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.expect_blocked('insert istirahat', $q$insert into public.attendance_break_logs (attendance_log_id, user_id, date, window_start, window_end, break_out_at) values ('00000000-0000-4000-8000-0000000000b1', auth.uid(), date '2099-02-01', '15:00', '16:00', now())$q$);
select pg_temp.expect_blocked('ubah jam istirahat', $q$update public.attendance_break_logs set break_out_at = now() - interval '2 hour' where id = '00000000-0000-4000-8000-0000000000c1'$q$);
select pg_temp.expect_blocked('insert permintaan lembur', $q$insert into public.overtime_requests (attendance_log_id, user_id, date, overtime_minutes, reason) values ('00000000-0000-4000-8000-0000000000b1', auth.uid(), date '2099-02-01', 600, 'x')$q$);
-- ...tapi tetap bisa MEMBACA absensinya sendiri.
select pg_temp.expect_rows('baca absensi sendiri', $q$select 1 from public.attendance_logs where user_id = auth.uid()$q$);
select pg_temp.expect_rows('baca istirahat sendiri', $q$select 1 from public.attendance_break_logs where user_id = auth.uid()$q$);

-- SM-6: konfigurasi kepegawaian/gaji hanya admin.
select pg_temp.expect_blocked('grace_period_min', $q$update public.profiles set grace_period_min = 999 where id = auth.uid()$q$);
select pg_temp.expect_blocked('work_start_time', $q$update public.profiles set work_start_time = '13:00' where id = auth.uid()$q$);
select pg_temp.expect_blocked('work_end_time', $q$update public.profiles set work_end_time = '13:00' where id = auth.uid()$q$);
select pg_temp.expect_blocked('workdays', $q$update public.profiles set workdays = 1 where id = auth.uid()$q$);
select pg_temp.expect_blocked('workday_check_enabled', $q$update public.profiles set workday_check_enabled = true where id = auth.uid()$q$);
select pg_temp.expect_blocked('is_flexible_schedule', $q$update public.profiles set is_flexible_schedule = true where id = auth.uid()$q$);
select pg_temp.expect_blocked('break_windows', $q$update public.profiles set break_enabled = true, break_windows = '[]' where id = auth.uid()$q$);
select pg_temp.expect_blocked('payslip_excluded', $q$update public.profiles set payslip_excluded = true where id = auth.uid()$q$);
select pg_temp.expect_blocked('holiday_bonus_enabled', $q$update public.profiles set holiday_bonus_enabled = true where id = auth.uid()$q$);
select pg_temp.expect_blocked('extra_work_enabled', $q$update public.profiles set extra_work_enabled = true where id = auth.uid()$q$);
select pg_temp.expect_blocked('is_probation', $q$update public.profiles set is_probation = true where id = auth.uid()$q$);
select pg_temp.expect_blocked('position', $q$update public.profiles set "position" = 'Kepala' where id = auth.uid()$q$);
select pg_temp.expect_blocked('is_active', $q$update public.profiles set is_active = false where id = auth.uid()$q$);
select pg_temp.expect_blocked('streak', $q$update public.profiles set streak_personal_best = 999 where id = auth.uid()$q$);
select pg_temp.expect_blocked('disc_test_required', $q$update public.profiles set disc_test_required = not disc_test_required where id = auth.uid()$q$);
select pg_temp.expect_blocked('push_notification_exempt', $q$update public.profiles set push_notification_exempt = true where id = auth.uid()$q$);
select pg_temp.expect_blocked('ganti unit bisnis yang sudah terisi', $q$update public.profiles set business_unit = 'Yeobo Space' where id = auth.uid()$q$);
select pg_temp.expect_blocked('ganti tanggal mulai kerja yang sudah terisi', $q$update public.profiles set first_day_of_work = '2020-01-01' where id = auth.uid()$q$);
select pg_temp.expect_blocked('ubah profil orang lain', $q$update public.profiles set nickname = 'X' where id = '00000000-0000-4000-8000-0000000000e2'$q$);

-- Data diri dasar & kolom teknis milik sendiri tetap bisa.
select pg_temp.expect_rows('data diri dasar', $q$update public.profiles set nickname = 'Lama', motto = 'Semangat', whatsapp_number = '08123', shirt_size = 'L', domisili_kota = 'Pare' where id = auth.uid()$q$);
select pg_temp.expect_rows('avatar', $q$update public.profiles set avatar_seed = 'abc', avatar_url = null where id = auth.uid()$q$);
select pg_temp.expect_rows('PIN POS', $q$update public.profiles set pos_pin_hash = 'hash' where id = auth.uid()$q$);
select pg_temp.expect_rows('nilai onboarding sama (formulir kirim ulang)', $q$update public.profiles set business_unit = 'Haengbocake', nickname = 'Lama' where id = auth.uid()$q$);

-- SM-1 tetap berlaku: slip.
select pg_temp.expect_blocked('tandai slip sendiri lunas', $q$update public.payslips set payment_status = 'paid' where id = '00000000-0000-4000-8000-0000000000f1'$q$);
select pg_temp.expect_rows('tanggapi slip', $q$update public.payslips set employee_response = 'acknowledged', employee_response_at = now() where id = '00000000-0000-4000-8000-0000000000f1'$q$);
reset role;

-- ══ Karyawan baru (e2): isi data onboarding sekali ═════════════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_rows('onboarding pertama kali', $q$update public.profiles set business_unit = 'Haengbocake', job_role = 'Kasir', first_day_of_work = '2026-11-01' where id = auth.uid()$q$);
select pg_temp.expect_blocked('onboarding kedua kali', $q$update public.profiles set job_role = 'Kepala' where id = auth.uid()$q$);
reset role;

-- ══ Pendaftar belum disetujui (e3) ═════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_blocked('aktifkan akun sendiri', $q$update public.profiles set is_active = true where id = auth.uid()$q$);
reset role;

-- ══ Service role: jalur server action SM-7 ═════════════════════════════════
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select pg_temp.expect_rows('check-in (insert server)',
  $q$insert into public.attendance_logs (user_id, date, checked_in_at, status, late_minutes, bonus_day, is_early_arrival, overtime_status)
     values ('00000000-0000-4000-8000-0000000000e1', date '2099-03-01', now(), 'late', 12, false, false, null)$q$);
select pg_temp.expect_rows('istirahat mulai', $q$insert into public.attendance_break_logs (attendance_log_id, user_id, date, window_start, window_end, break_out_at) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e1', date '2099-02-01', '15:00', '16:00', now())$q$);
select pg_temp.expect_rows('istirahat selesai', $q$update public.attendance_break_logs set break_in_at = now() where id = '00000000-0000-4000-8000-0000000000c1' and user_id = '00000000-0000-4000-8000-0000000000e1' and break_in_at is null$q$);
select pg_temp.expect_rows('total istirahat', $q$update public.attendance_logs set total_break_minutes = 30 where id = '00000000-0000-4000-8000-0000000000b1' and user_id = '00000000-0000-4000-8000-0000000000e1' and checked_out_at is null$q$);
select pg_temp.expect_rows('check-out + ajukan lembur', $q$update public.attendance_logs set checked_out_at = now() + interval '9 hour', is_overtime = true, overtime_minutes = 60, overtime_status = 'pending' where id = '00000000-0000-4000-8000-0000000000b1' and user_id = '00000000-0000-4000-8000-0000000000e1' and checked_out_at is null$q$);
select pg_temp.expect_rows('permintaan lembur', $q$insert into public.overtime_requests (attendance_log_id, user_id, date, overtime_minutes, reason) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e1', date '2099-02-01', 60, 'tutup toko')$q$);
-- Filter peniru-RLS: re-check-in setelah pulang tetap 0 baris seperti sebelum migrasi.
select pg_temp.expect_rows('re-check-in log yang sudah pulang (perilaku lama: 0 baris)', $q$update public.attendance_logs set checked_out_at = null where id = '00000000-0000-4000-8000-0000000000b1' and user_id = '00000000-0000-4000-8000-0000000000e1' and checked_out_at is null$q$, 0);
select pg_temp.expect_rows('bukti telat (upload-proof)', $q$update public.attendance_logs set late_proof_status = 'pending', late_proof_url = 'x' where id = '00000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.expect_rows('streak', $q$update public.profiles set streak_personal_best = 7, streak_last_milestone = 5 where id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.expect_rows('flag DISC', $q$update public.profiles set disc_test_required = false where id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.expect_rows('route profil (service) jadwal', $q$update public.profiles set work_start_time = '08:00' where id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.expect_error('hitung ulang menimpa slip final', $q$update public.payslips set net_total = 1 where id = '00000000-0000-4000-8000-0000000000f1'$q$, '23514');
reset role;

-- ══ Admin ═══════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_rows('setujui lembur', $q$update public.attendance_logs set overtime_status = 'approved' where id = '00000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.expect_rows('setujui bukti telat', $q$update public.attendance_logs set late_proof_status = 'approved', status = 'late_excused', late_proof_admin_note = 'ok' where id = '00000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.expect_rows('admin edit absensi', $q$update public.attendance_logs set checked_in_at = checked_in_at - interval '5 minute' where id = '00000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.expect_rows('admin ubah jadwal karyawan', $q$update public.profiles set grace_period_min = 10, workdays = 62, payslip_excluded = false where id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.expect_rows('admin ganti unit bisnis', $q$update public.profiles set business_unit = 'Yeobo Space' where id = '00000000-0000-4000-8000-0000000000e1'$q$);
select pg_temp.expect_rows('admin setujui pendaftar', $q$update public.profiles set is_active = true where id = '00000000-0000-4000-8000-0000000000e3'$q$);
select pg_temp.expect_rows('admin finalisasi draft', $q$update public.payslips set status = 'finalized' where id = '00000000-0000-4000-8000-0000000000f2'$q$);
select pg_temp.expect_rows('admin tandai lunas', $q$update public.payslips set payment_status = 'paid', payment_at = now() where id = '00000000-0000-4000-8000-0000000000f1'$q$);
select pg_temp.expect_error('admin ubah angka slip final', $q$update public.payslips set net_total = 1 where id = '00000000-0000-4000-8000-0000000000f1'$q$, '23514');
select pg_temp.expect_rows('admin buka ulang', $q$update public.payslips set status = 'draft' where id = '00000000-0000-4000-8000-0000000000f1'$q$);
select pg_temp.expect_rows('admin hitung ulang draft', $q$update public.payslips set net_total = 2900000 where id = '00000000-0000-4000-8000-0000000000f1'$q$);
reset role;

select 'OK: 323+324 guard & kompatibilitas lolos' as result;

rollback;
