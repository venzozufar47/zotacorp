-- Publikasikan table finance + POS + investor ke supabase_realtime
-- supaya client bisa subscribe postgres_changes event. Tanpa publish,
-- subscription silent no-op (event tidak dikirim).
--
-- Wrap setiap ADD TABLE dalam DO/EXCEPTION supaya idempotent — table
-- yang sudah dipublikasikan tidak menyebabkan migration gagal.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cashflow_transactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cashflow_statements;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_sales;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.investor_payouts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bu_metric_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
