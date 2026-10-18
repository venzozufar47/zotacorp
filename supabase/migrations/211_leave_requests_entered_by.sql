-- Izin yang diinput atasan / Owner atas nama karyawan (jalur kedua selain pengajuan karyawan).
-- entered_by = siapa yang mencatatkannya; NULL = diajukan karyawan sendiri. Baris yang diinput atasan langsung
-- berstatus 'approved' dengan approver_id = entered_by (atasan sendiri yang memutuskan, tanpa persetujuan kedua).
-- Izin TIDAK terhubung ke absen: hari izin tetap dihitung tidak masuk.
alter table public.leave_requests
  add column if not exists entered_by uuid references public.profiles(id) on delete set null;
