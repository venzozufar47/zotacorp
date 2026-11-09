-- Tes regresi migrasi 323_state_machine_guards.sql (docs/STATE_MACHINES.md SM-1).
--
-- Aman dijalankan di database mana pun yang sudah memuat migrasi 323: semua
-- dibungkus satu transaksi yang di-ROLLBACK, jadi tidak ada data yang
-- tertinggal. Setiap pemeriksaan yang gagal memunculkan exception "FAIL: ...".
-- Untuk menguji SEBELUM migrasi diterapkan: sisipkan isi migrasi 323 tepat
-- setelah `begin;` (DDL Postgres ikut ter-rollback).

begin;

-- Fixture: satu karyawan aktif yang punya slip final.
create temp table _fx on commit drop as
select p.id as payslip_id, p.user_id
from public.payslips p
join public.profiles pr on pr.id = p.user_id and pr.role = 'employee' and pr.is_active
where p.status = 'finalized'
limit 1;
grant select on _fx to authenticated;

do $$ begin
  if not exists (select 1 from _fx) then raise exception 'FAIL: tidak ada fixture slip final'; end if;
end $$;

-- Baris absensi terbuka milik karyawan itu (ditulis sebagai service/postgres).
insert into public.attendance_logs (user_id, date, checked_in_at, status)
select user_id, date '2099-01-01', now(), 'on_time' from _fx;

-- 1) Semua peran: angka slip final tidak boleh berubah selama tetap final.
do $$ begin
  update public.payslips set net_total = net_total + 1 where id = (select payslip_id from _fx);
  raise exception 'FAIL: net_total slip final berubah';
exception when check_violation then null;
end $$;

-- Pembayaran & tanggapan tetap boleh pada slip final.
update public.payslips set payment_note = 'tes', updated_at = now() where id = (select payslip_id from _fx);

-- Masuk sebagai karyawan.
select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true) from _fx;
set local role authenticated;

-- 2) Karyawan tidak boleh mengubah status bayar / angka slipnya. Nilainya DIBALIK
--    (slip produksi bisa saja sudah lunas; menulis nilai yang sama bukan perubahan).
do $$ begin
  update public.payslips
    set payment_status = case when payment_status = 'paid' then 'unpaid' else 'paid' end
    where id = (select payslip_id from _fx);
  raise exception 'FAIL: karyawan mengubah status bayar slipnya sendiri';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.payslips set net_total = net_total + 1000000 where id = (select payslip_id from _fx);
  raise exception 'FAIL: karyawan mengubah net_total slipnya sendiri';
exception when insufficient_privilege or check_violation then null;
end $$;

-- 3) Karyawan tetap boleh menanggapi slipnya.
do $$
declare n int;
begin
  update public.payslips
    set employee_response = case when employee_response = 'acknowledged' then 'pending' else 'acknowledged' end,
        employee_response_at = now()
  where id = (select payslip_id from _fx);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: tanggapan karyawan tertolak (row_count=%)', n; end if;
end $$;

-- 4) Karyawan tidak boleh menyetujui lemburnya sendiri (UPDATE baris terbuka).
do $$ begin
  update public.attendance_logs set is_overtime = true, overtime_minutes = 600, overtime_status = 'approved'
  where date = date '2099-01-01';
  raise exception 'FAIL: karyawan menyetujui lemburnya sendiri';
exception when insufficient_privilege then null;
end $$;

-- 5) ...tapi tetap boleh mengajukannya (pending), seperti alur check-out.
do $$
declare n int;
begin
  update public.attendance_logs set is_overtime = true, overtime_minutes = 60, overtime_status = 'pending'
  where date = date '2099-01-01';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: pengajuan lembur tertolak (row_count=%)', n; end if;
end $$;

-- 6) Karyawan tidak boleh menyisipkan log dengan lembur yang sudah "disetujui".
do $$ begin
  insert into public.attendance_logs (user_id, date, checked_in_at, checked_out_at, status, is_overtime, overtime_minutes, overtime_status)
  values (auth.uid(), date '2099-01-02', now(), now(), 'on_time', true, 600, 'approved');
  raise exception 'FAIL: karyawan menyisipkan lembur yang sudah disetujui';
exception when insufficient_privilege then null;
end $$;

-- 7) Karyawan tidak boleh mengubah status aktif/resign-nya sendiri.
do $$ begin
  update public.profiles set is_active = false where id = auth.uid();
  raise exception 'FAIL: karyawan mengubah is_active-nya sendiri';
exception when insufficient_privilege then null;
end $$;

-- 8) ...tapi kolom profil biasa tetap boleh.
do $$
declare n int;
begin
  update public.profiles set motto = coalesce(motto, '') where id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: edit profil biasa tertolak (row_count=%)', n; end if;
end $$;

select 'OK: semua penjaga mesin status lolos' as result;

rollback;
