-- Monthly revenue allocation per branch (Yeobo Space).
--
-- Operating revenue posted with branch="All" (lump deposits not tied to
-- a single cabang) defaults to a 1/3 even auto-split in the PnL. Admin
-- instead wants to divide each MONTH's total branch=All operating
-- revenue across the 3 cabang by hand (not per-transaction — per month).
--
-- One row per (business_unit, year, month, branch). The aggregator
-- distributes that month's branch=All operating revenue across cabang
-- PROPORTIONALLY to these amounts (ratio = amount_b / Σamount), so the
-- split is drift-proof: it always sums to the actual monthly revenue
-- even if transactions change after allocation.

-- Drop the earlier per-transaction table (created + reverted same
-- session, never used in production) in favor of the monthly model.
DROP TABLE IF EXISTS public.revenue_allocations;

CREATE TABLE IF NOT EXISTS public.revenue_month_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit TEXT NOT NULL,
  period_year INT NOT NULL,
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  branch TEXT NOT NULL,
  amount NUMERIC(16,2) NOT NULL CHECK (amount >= 0),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_unit, period_year, period_month, branch)
);

CREATE INDEX IF NOT EXISTS revenue_month_allocations_period_idx
  ON public.revenue_month_allocations(business_unit, period_year, period_month);

ALTER TABLE public.revenue_month_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY revenue_month_allocations_admin_all
  ON public.revenue_month_allocations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
