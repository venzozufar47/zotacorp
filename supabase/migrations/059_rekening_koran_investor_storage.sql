-- Investor SELECT untuk PDF rekening koran di storage bucket
-- `rekening-koran`. Investor boleh download file kalau path-nya cocok
-- dengan `pdf_path` di cashflow_statements yang bank_account-nya ada
-- di business_unit yang sudah di-assign ke investor tersebut.

CREATE POLICY "rekening_koran_investor_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'rekening-koran'
    AND EXISTS (
      SELECT 1
      FROM public.cashflow_statements s
      JOIN public.bank_accounts b ON b.id = s.bank_account_id
      WHERE s.pdf_path = storage.objects.name
        AND public.is_investor_for_business_unit(b.business_unit)
    )
  );
