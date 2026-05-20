-- POS discount campaigns: simple per-account, date-range discount with
-- percentage + rounding rule. Used by createPosSale to apply discounts
-- on the fly + by the retro action to re-stamp existing sales when a
-- campaign is activated mid-day.

CREATE TABLE public.pos_discount_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  percent_off NUMERIC(5,2) NOT NULL CHECK (percent_off >= 0 AND percent_off <= 100),
  rounding_unit INTEGER NOT NULL DEFAULT 1000 CHECK (rounding_unit > 0),
  rounding_mode TEXT NOT NULL DEFAULT 'floor' CHECK (rounding_mode IN ('floor','nearest','ceil')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT pos_disc_range_chk CHECK (end_date >= start_date)
);

CREATE INDEX pos_discount_campaigns_account_range_idx
  ON public.pos_discount_campaigns(bank_account_id, start_date, end_date);

ALTER TABLE public.pos_discount_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_disc_admin_select"
  ON public.pos_discount_campaigns FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "pos_disc_admin_modify"
  ON public.pos_discount_campaigns FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "pos_disc_assignee_select"
  ON public.pos_discount_campaigns FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bank_account_assignees ba
      WHERE ba.bank_account_id = pos_discount_campaigns.bank_account_id
        AND ba.user_id = auth.uid()
    )
  );
