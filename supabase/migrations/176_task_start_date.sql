-- Tanggal mulai Tugas Karyawan: tugas baru muncul di karyawan (beranda, gate
-- sign out, pengingat) mulai tanggal ini (tanggal Jakarta). Sebelum itu tugas
-- hanya terlihat admin dan Team leader sebagai "Terjadwal".
--
-- start_notified_at: kapan push "Tugas baru" dikirim ke karyawan. Tugas yang
-- dijadwalkan ke depan TIDAK dipush saat dibuat, tapi saat tanggal mulainya
-- tiba (cron per jam, hanya jam wajar — bukan tengah malam).

alter table public.assigned_tasks
  add column if not exists start_date date,
  add column if not exists start_notified_at timestamptz;

-- Tugas lama: mulai di hari dibuat dan sudah dianggap diberitahu.
update public.assigned_tasks
set start_date = (created_at at time zone 'Asia/Jakarta')::date,
    start_notified_at = coalesce(start_notified_at, created_at)
where start_date is null;

alter table public.assigned_tasks
  alter column start_date set not null,
  alter column start_date set default ((now() at time zone 'Asia/Jakarta')::date);

create index if not exists assigned_tasks_start_idx
  on public.assigned_tasks (start_date)
  where status = 'open' and start_notified_at is null;
