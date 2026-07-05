-- Monthly "extra-day" overtime opt-in per employee.
--
-- When ON, any attended day beyond the employee's monthly quota
-- (expected_work_days) is paid as one full overtime day, valued by the
-- employee's existing overtime_mode (fixed_per_day → ot_fixed_daily_rate,
-- half_daily → ½ daily, hourly_tiered → a full standard day at tiered
-- rates). This is ADDED on top of the normal per-day overtime; the
-- per-day overtime calculation is unchanged.
--
-- Default false → no existing payslip changes.

alter table public.payslip_settings
  add column if not exists monthly_overtime_enabled boolean not null default false;
