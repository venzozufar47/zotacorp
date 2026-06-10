-- Per-assignment option to skip national holidays ("tanggal merah"): when on,
-- the checklist is treated as not-scheduled on any date present in
-- national_holidays — nobody sees it, it doesn't block checkout, and it isn't
-- flagged in the monitor. Applies to standalone assignments and rotations alike.
-- (For rotations the calendar owner index is unchanged; the holiday is simply
-- skipped for everyone that day.)

alter table public.cleaning_assignments
  add column if not exists skip_holidays boolean not null default false;
