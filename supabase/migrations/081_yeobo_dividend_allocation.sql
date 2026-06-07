-- Per-investor monthly DIVIDEND allocation for Yeobo Space.
--
-- Splits each branch's monthly Dividend pool (already a non-operating
-- line in the PnL — hardcoded "Dividends & BEP" for 2023-2025, live
-- category='Dividend' for 2026+) across a management slot + N investors.
-- This is a BREAKDOWN of the existing Dividend figure (same idea as
-- salary_allocations breaking down one Salaries tx): it creates NO new
-- ledger entries and does not change PnL totals / operating profit.
--
-- Recipients can be defined BEFORE an investor account/contract exists
-- (nullable user_id/contract_id) and linked later. Once linked, the
-- per-month amounts are synced into investor_payouts so the investor
-- dashboard surfaces them (with backfill of prior months on link).
--
-- Pool ratio (management vs investor pool) flips at BEP, per branch.

-- ── Structure: who receives, and their share within the investor pool ──
CREATE TABLE IF NOT EXISTS public.yeobo_dividend_recipients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch      TEXT NOT NULL,                       -- Tlogosari | Tembalang | Jebres
  label       TEXT NOT NULL,                       -- "Management", "Investor A"...
  kind        TEXT NOT NULL CHECK (kind IN ('management','investor')),
  sort_order  INT  NOT NULL DEFAULT 0,
  pool_pct    NUMERIC(6,3) CHECK (pool_pct >= 0 AND pool_pct <= 100), -- % WITHIN investor pool; NULL for management
  invest_idr  NUMERIC(16,2),                       -- nominal investasi asli (sumber kebenaran %; BEP per investor = ini)
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,           -- link later
  contract_id UUID REFERENCES public.investor_contracts(id) ON DELETE SET NULL, -- link later
  active      BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (branch, label)
);
CREATE INDEX IF NOT EXISTS yeobo_dividend_recipients_branch_idx
  ON public.yeobo_dividend_recipients(branch);

-- ── Per-branch pool ratio (mgmt vs investor pool) + BEP target ──
CREATE TABLE IF NOT EXISTS public.yeobo_dividend_branch_config (
  branch               TEXT PRIMARY KEY,
  mgmt_pct_before_bep  NUMERIC(6,3) NOT NULL DEFAULT 35,
  mgmt_pct_after_bep   NUMERIC(6,3) NOT NULL DEFAULT 50,
  total_investment_idr NUMERIC(16,2),      -- total modal investor cabang (e.g. Tlogosari 110jt)
  -- BEP (single branch flip) reached when cumulative investor-pool payout
  -- ≥ total_investment_idr. Since each investor's payout AND BEP target are
  -- both proportional to their pool %, all investors cross BEP at the same
  -- time → one flip 35/65 → 50/50. NULL target = never auto-BEP.
  bep_reached_ym       TEXT,               -- manual override 'YYYY-MM' (wins over auto)
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ── Frozen per-recipient monthly amounts (snapshot on confirm) ──
CREATE TABLE IF NOT EXISTS public.yeobo_dividend_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.yeobo_dividend_recipients(id) ON DELETE CASCADE,
  period_year  INT NOT NULL,
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  amount_idr   NUMERIC(16,2) NOT NULL CHECK (amount_idr >= 0),
  pool_idr     NUMERIC(16,2),             -- branch-month pool snapshot (audit)
  after_bep    BOOLEAN NOT NULL DEFAULT false,
  source       TEXT NOT NULL DEFAULT 'computed' CHECK (source IN ('computed','override')),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (recipient_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS yeobo_dividend_allocations_period_idx
  ON public.yeobo_dividend_allocations(period_year, period_month);

-- ── RLS ──
ALTER TABLE public.yeobo_dividend_recipients   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yeobo_dividend_branch_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yeobo_dividend_allocations  ENABLE ROW LEVEL SECURITY;

-- Admin full access on all three (mirror revenue_month_allocations).
CREATE POLICY ydiv_recipients_admin_all ON public.yeobo_dividend_recipients
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY ydiv_config_admin_all ON public.yeobo_dividend_branch_config
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY ydiv_alloc_admin_all ON public.yeobo_dividend_allocations
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Investor self-read: only their OWN allocation rows (own dividend).
-- Recipients/config are NOT exposed to investors (would leak co-investor %).
CREATE POLICY ydiv_alloc_self_read ON public.yeobo_dividend_allocations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.yeobo_dividend_recipients r
    WHERE r.id = yeobo_dividend_allocations.recipient_id AND r.user_id = auth.uid()
  ));
