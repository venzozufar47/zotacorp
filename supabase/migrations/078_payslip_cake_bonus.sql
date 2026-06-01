-- Dedicated "cake bonus" line on payslips, separate from the manual
-- `monthly_bonus`. Auto-computed during payslip generation from the
-- cake-decorator / cake-admin rules (see src/lib/cake-bonus), keyed by
-- the recipient's profiles.position. Kept separate so it never clobbers
-- an admin's ad-hoc monthly_bonus and is always recomputed from source.

ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS cake_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cake_bonus_note text;

COMMENT ON COLUMN public.payslips.cake_bonus IS
  'Auto-computed cake bonus (decorator per-cake or admin company bonus), added to net_total. Recomputed each payslip generation from cake_orders / cashflow per recipient position.';
