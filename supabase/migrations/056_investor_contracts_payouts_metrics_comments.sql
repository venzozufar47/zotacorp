-- Investor Dashboard v2 schema: kontrak per (investor, BU), payouts
-- bulanan, operational metrics per BU per bulan (hybrid: admin input
-- + auto-derive dari POS), comment thread per (BU, metric_id).

CREATE TABLE public.investor_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_unit TEXT NOT NULL,
  total_invest_idr NUMERIC(16,2) NOT NULL CHECK (total_invest_idr > 0),
  bagi_hasil_pct NUMERIC(5,2) NOT NULL CHECK (bagi_hasil_pct >= 0 AND bagi_hasil_pct <= 100),
  durasi_bulan INT NOT NULL CHECK (durasi_bulan > 0),
  start_date DATE NOT NULL,
  bep_target_idr NUMERIC(16,2) NOT NULL,
  payout_rekening_label TEXT,
  contract_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (user_id, business_unit)
);

CREATE TABLE public.investor_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.investor_contracts(id) ON DELETE CASCADE,
  period_year INT NOT NULL,
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  amount_idr NUMERIC(16,2) NOT NULL CHECK (amount_idr >= 0),
  paid_at TIMESTAMPTZ,
  ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (contract_id, period_year, period_month)
);

CREATE TABLE public.bu_monthly_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit TEXT NOT NULL,
  period_year INT NOT NULL,
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  utilization_pct NUMERIC(5,2),
  orders_count INT,
  unique_customers INT,
  production_capacity_max INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (business_unit, period_year, period_month)
);

CREATE TABLE public.bu_metric_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('investor','admin')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX investor_contracts_user_idx ON public.investor_contracts(user_id);
CREATE INDEX investor_payouts_contract_period_idx ON public.investor_payouts(contract_id, period_year DESC, period_month DESC);
CREATE INDEX bu_metrics_lookup_idx ON public.bu_monthly_metrics(business_unit, period_year DESC, period_month DESC);
CREATE INDEX bu_comments_lookup_idx ON public.bu_metric_comments(business_unit, metric_id, created_at);

ALTER TABLE public.investor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bu_monthly_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bu_metric_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ic_admin_all ON public.investor_contracts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY ic_self_read ON public.investor_contracts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY ip_admin_all ON public.investor_payouts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY ip_self_read ON public.investor_payouts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.investor_contracts c
    WHERE c.id = investor_payouts.contract_id AND c.user_id = auth.uid()
  ));

CREATE POLICY bm_admin_all ON public.bu_monthly_metrics FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY bm_investor_read ON public.bu_monthly_metrics FOR SELECT TO authenticated
  USING (public.is_investor_for_business_unit(business_unit));

CREATE POLICY bc_admin_all ON public.bu_metric_comments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY bc_investor_read ON public.bu_metric_comments FOR SELECT TO authenticated
  USING (public.is_investor_for_business_unit(business_unit));
CREATE POLICY bc_investor_insert ON public.bu_metric_comments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_investor_for_business_unit(business_unit)
    AND author_id = auth.uid()
    AND author_role = 'investor'
  );
CREATE POLICY bc_self_delete ON public.bu_metric_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());
