-- Istirahat (break) feature for attendance.
--
-- Opt-in per employee: when break_enabled, the employee has one or more break
-- windows (HH:MM ranges within work hours). They must check-out for break only
-- while inside a window and check back in (each with selfie + geofence + the
-- normal password gate). Multiple breaks/day are supported via a dedicated
-- table (one row per break session).

-- 1. Per-employee config on profiles.
alter table public.profiles
  add column if not exists break_enabled boolean not null default false,
  add column if not exists break_windows jsonb not null default '[]'::jsonb;

-- 2. Denormalized total break minutes for the day (display + payroll).
alter table public.attendance_logs
  add column if not exists total_break_minutes integer not null default 0;

-- 3. One row per break session.
create table if not exists public.attendance_break_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_log_id uuid not null references public.attendance_logs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  window_start text not null,
  window_end text not null,
  break_out_at timestamptz not null,
  break_out_latitude double precision,
  break_out_longitude double precision,
  break_out_selfie_path text,
  break_out_matched_location_id uuid references public.attendance_locations(id) on delete set null,
  break_in_at timestamptz,
  break_in_latitude double precision,
  break_in_longitude double precision,
  break_in_selfie_path text,
  break_in_matched_location_id uuid references public.attendance_locations(id) on delete set null,
  late_return boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attendance_break_logs_log_idx
  on public.attendance_break_logs(attendance_log_id);
create index if not exists attendance_break_logs_user_date_idx
  on public.attendance_break_logs(user_id, date);

alter table public.attendance_break_logs enable row level security;

-- Employees manage their own break rows; admins manage all. Mirrors the
-- attendance_logs policies (own via auth.uid(), admin via is_admin()).
drop policy if exists attendance_break_select_own on public.attendance_break_logs;
create policy attendance_break_select_own on public.attendance_break_logs
  for select using (user_id = auth.uid());
drop policy if exists attendance_break_select_admin on public.attendance_break_logs;
create policy attendance_break_select_admin on public.attendance_break_logs
  for select using (is_admin());

drop policy if exists attendance_break_insert_own on public.attendance_break_logs;
create policy attendance_break_insert_own on public.attendance_break_logs
  for insert with check (user_id = auth.uid());

drop policy if exists attendance_break_update_own on public.attendance_break_logs;
create policy attendance_break_update_own on public.attendance_break_logs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists attendance_break_update_admin on public.attendance_break_logs;
create policy attendance_break_update_admin on public.attendance_break_logs
  for update using (is_admin());

drop policy if exists attendance_break_delete_admin on public.attendance_break_logs;
create policy attendance_break_delete_admin on public.attendance_break_logs
  for delete using (is_admin());
