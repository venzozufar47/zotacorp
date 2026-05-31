-- "Selang-seling berpasangan" expected-days mode. Two employees share one
-- (or more) weekday and alternate on it week-by-week. The system computes
-- each person's expected_work_days per month automatically.
--
-- expected_days_mode gains a new value: 'paired_alternating'.
--   * expected_pair_user_id — the partner employee.
--   * expected_pair_primary — true for the member who takes the FIRST parity
--     on shared days ("masuk duluan"); exactly one of the pair is true.
--   * expected_pair_anchor — fixed reference date (stored once at pairing
--     creation) that fixes the alternation parity so it flows continuously
--     across month boundaries instead of resetting each month.
alter table public.payslip_settings
  add column if not exists expected_pair_user_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists expected_pair_primary boolean not null default false,
  add column if not exists expected_pair_anchor date;

-- Allow the new mode value in the existing CHECK constraint.
alter table public.payslip_settings
  drop constraint if exists payslip_settings_expected_days_mode_check;
alter table public.payslip_settings
  add constraint payslip_settings_expected_days_mode_check
  check (expected_days_mode = any (array[
    'manual'::text, 'weekly_pattern'::text, 'none'::text, 'paired_alternating'::text
  ]));
