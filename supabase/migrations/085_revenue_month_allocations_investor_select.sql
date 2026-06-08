-- Investor parity fix for the Yeobo PnL.
--
-- The investor dashboard runs fetchYeoboPnL() with the investor's RLS
-- client. That aggregator reads `revenue_month_allocations` to split each
-- month's branch="All" revenue per the admin-set per-branch ratio. The
-- table previously had ONLY an admin SELECT policy, so the investor read
-- returned empty and the aggregator fell back to an even 1/3 auto-split —
-- producing a higher branch operating revenue/profit than the admin PnL
-- spreadsheet (which DOES read the allocations).
--
-- Fix: allow investors to SELECT the revenue allocations for a business
-- unit they're assigned to, mirroring cashflow_pusat_allocations_investor_select.
-- Investors can already read all cashflow_transactions for their BU, so
-- these per-branch monthly revenue split totals are not newly sensitive.

CREATE POLICY revenue_month_allocations_investor_select
  ON public.revenue_month_allocations
  FOR SELECT
  TO authenticated
  USING (is_investor_for_business_unit(business_unit));
