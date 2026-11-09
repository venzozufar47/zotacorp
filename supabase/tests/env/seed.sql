-- Data contoh untuk tes guard (Postgres lokal saja; JANGAN dijalankan di produksi).
insert into public.profiles (id, full_name, email, role, is_active, business_unit, job_role, first_day_of_work)
values
  ('00000000-0000-4000-8000-0000000000a1', 'Admin Tes', 'admin@test.local', 'admin', true, null, null, null),
  ('00000000-0000-4000-8000-0000000000e1', 'Karyawan Lama', 'lama@test.local', 'employee', true, 'Haengbocake', 'Kasir', '2025-01-06'),
  ('00000000-0000-4000-8000-0000000000e2', 'Karyawan Baru', 'baru@test.local', 'employee', true, null, null, null),
  ('00000000-0000-4000-8000-0000000000e3', 'Pendaftar', 'daftar@test.local', 'employee', false, null, null, null);

insert into public.payslips (id, user_id, month, year, status, base_salary, prorated_salary, net_total)
values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 10, 2026, 'finalized', 3000000, 3000000, 3000000),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e1', 11, 2026, 'draft', 3000000, 3000000, 3000000);

insert into public.attendance_logs (id, user_id, date, checked_in_at, status, late_minutes)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e1', date '2099-02-01', now(), 'late', 20);
