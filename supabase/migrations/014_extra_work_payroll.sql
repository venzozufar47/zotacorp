-- Per-employee IDR rate paid for each "extra work" entry that lands
-- inside a payslip's month. Defaults to 0 so existing employees with
-- the toggle on but no rate set still pay nothing — admin must
-- explicitly opt in by setting a rate.
alter table public.payslip_settings
  add column if not exists extra_work_rate_idr integer not null default 0
  check (extra_work_rate_idr >= 0);

-- Per-payslip extra-work earnings line. Lives alongside overtime_pay /
-- late_penalty so it shows up cleanly in the row totals; the per-entry
-- breakdown is captured inside breakdown_json for transparency.
alter table public.payslips
  add column if not exists extra_work_pay integer not null default 0
  check (extra_work_pay >= 0);
