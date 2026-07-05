-- New overtime mode variant: hourly_tiered_reduced (1.2x first hour, 1.5x
-- subsequent hours) — a lower-rate alternative to hourly_tiered (1.5x/2x).
-- The overtime_mode CHECK constraint must allow the new value.

alter table public.payslip_settings
  drop constraint if exists payslip_settings_overtime_mode_check;

alter table public.payslip_settings
  add constraint payslip_settings_overtime_mode_check
  check (overtime_mode = any (array['hourly_tiered','fixed_per_day','half_daily','hourly_tiered_reduced']));
