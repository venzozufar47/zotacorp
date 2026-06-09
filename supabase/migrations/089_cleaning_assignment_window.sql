-- Time-of-day window for when a cleaning assignment may be performed.
--   anytime  → no restriction
--   before   → only until window_end   (e.g. opening tasks before 10:00)
--   after    → only from window_start   (e.g. closing tasks after 20:00)
--   between  → only within window_start..window_end
-- Times are 'HH:MM' (local org timezone). The completion action enforces this;
-- the employee card shows the window and disables capture when it's closed.

alter table public.cleaning_assignments
  add column if not exists window_mode text not null default 'anytime',
  add column if not exists window_start text,
  add column if not exists window_end text;

alter table public.cleaning_assignments
  drop constraint if exists cleaning_assignments_window_mode_check;
alter table public.cleaning_assignments
  add constraint cleaning_assignments_window_mode_check
  check (window_mode in ('anytime', 'before', 'after', 'between'));
