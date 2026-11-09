-- ROLLBACK migrasi 324 → kembali ke keadaan "323 saja".
-- Aman dijalankan berulang. Tidak menyentuh data (hanya trigger/fungsi/policy).
--
-- PENTING: kode aplikasi SM-7 menulis absensi dengan service role, jadi tetap
-- berfungsi dengan atau tanpa policy di bawah. Rollback ini hanya
-- mengembalikan hak tulis langsung karyawan seperti sebelum 324.

begin;

drop trigger if exists profiles_guard_columns on public.profiles;
drop function if exists public.profiles_guard_columns();

-- Pulihkan penjaga profil versi 323.
create or replace function public.profiles_guard_lifecycle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.is_active is distinct from old.is_active
     or new.resigned_at is distinct from old.resigned_at
     or new.resigned_by is distinct from old.resigned_by then
    raise exception 'Status aktif/resign hanya boleh diubah admin'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_lifecycle on public.profiles;
create trigger profiles_guard_lifecycle
  before update on public.profiles
  for each row execute function public.profiles_guard_lifecycle();

-- Pulihkan policy tulis milik-sendiri persis seperti produksi 2026-11-09.
drop policy if exists attendance_insert_own on public.attendance_logs;
create policy attendance_insert_own on public.attendance_logs as permissive for insert to authenticated
  with check ((user_id = auth.uid()));
drop policy if exists attendance_update_own on public.attendance_logs;
create policy attendance_update_own on public.attendance_logs as permissive for update to authenticated
  using (((user_id = auth.uid()) and (checked_out_at is null))) with check ((user_id = auth.uid()));
drop policy if exists attendance_break_insert_own on public.attendance_break_logs;
create policy attendance_break_insert_own on public.attendance_break_logs as permissive for insert to public
  with check ((user_id = auth.uid()));
drop policy if exists attendance_break_update_own on public.attendance_break_logs;
create policy attendance_break_update_own on public.attendance_break_logs as permissive for update to public
  using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
drop policy if exists overtime_requests_insert_own on public.overtime_requests;
create policy overtime_requests_insert_own on public.overtime_requests as permissive for insert to authenticated
  with check ((user_id = auth.uid()));

commit;
