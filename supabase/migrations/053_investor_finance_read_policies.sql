-- Investor SELECT policies untuk finance — read-only via RLS.
-- Path baru di samping existing admin/assignee/POS policies; tidak
-- mengubah behavior policy lain. Investor butuh assignment ke
-- business_unit yang sesuai (lihat is_investor_for_business_unit
-- di migration 052).

CREATE POLICY "bank_accounts_investor_select"
  ON public.bank_accounts FOR SELECT
  TO authenticated
  USING (public.is_investor_for_business_unit(business_unit));

CREATE POLICY "cashflow_statements_investor_select"
  ON public.cashflow_statements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bank_accounts b
      WHERE b.id = cashflow_statements.bank_account_id
        AND public.is_investor_for_business_unit(b.business_unit)
    )
  );

CREATE POLICY "cashflow_transactions_investor_select"
  ON public.cashflow_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.cashflow_statements s
      JOIN public.bank_accounts b ON b.id = s.bank_account_id
      WHERE s.id = cashflow_transactions.statement_id
        AND public.is_investor_for_business_unit(b.business_unit)
    )
  );
