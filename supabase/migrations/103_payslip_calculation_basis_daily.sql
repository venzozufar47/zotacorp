-- Allow the new "daily" (gaji harian) calculation basis. The existing
-- CHECK constraint only permitted presence/deliverables/both/fixed, so
-- saving a "daily" basis in the payslip variables editor failed.

alter table public.payslip_settings
  drop constraint if exists payslip_settings_calculation_basis_check;

alter table public.payslip_settings
  add constraint payslip_settings_calculation_basis_check
  check (calculation_basis = any (array['presence','deliverables','both','fixed','daily']));
