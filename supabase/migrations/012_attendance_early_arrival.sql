-- Early-arrival overtime flag. Stamped at check-in when the employee
-- signed in more than 30 minutes before their scheduled work_start_time
-- (and is on a non-flexible schedule). Enables the overtime opt-in to
-- appear once the employee has completed one standard working duration,
-- rather than waiting for work_end_time.
alter table public.attendance_logs
  add column if not exists is_early_arrival boolean not null default false;
