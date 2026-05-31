-- Per-employee rule: pay "bonus" attendance days by ACTUAL HOURS worked
-- (hours × hourly_rate) instead of as a full proration day. Overtime on a
-- bonus day only applies when worked hours exceed the standard daily hours.
--
-- hourly_rate = base_salary / (expected_work_days × standard_working_hours).
-- Bonus days are excluded from actual_work_days (no full-day proration); the
-- resulting hourly pay is stored on the payslip as `bonus_day_pay`. Overtime
-- beyond standard hours follows the employee's configured overtime_mode/rate.
--
-- Opt-in per employee (default off → existing behaviour unchanged).
alter table public.payslip_settings
  add column if not exists bonus_day_hourly boolean not null default false;

alter table public.payslips
  add column if not exists bonus_day_pay integer not null default 0;
