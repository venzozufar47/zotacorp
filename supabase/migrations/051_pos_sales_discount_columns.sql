-- Add discount columns to pos_sales:
--   gross_total          → harga sebelum diskon (untuk traceability)
--   discount_amount      → selisih gross − total final (always ≥ 0)
--   discount_campaign_id → FK ke campaign yang berlaku saat sale
--
-- `pos_sales.total` tetap menyimpan harga FINAL (post-diskon, post-rounding)
-- supaya semua agregat existing (Riwayat, Insights, Saldo via
-- computeLatestBalance) langsung benar tanpa modifikasi caller.

ALTER TABLE public.pos_sales
  ADD COLUMN gross_total NUMERIC,
  ADD COLUMN discount_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN discount_campaign_id UUID
    REFERENCES public.pos_discount_campaigns(id) ON DELETE SET NULL;

CREATE INDEX pos_sales_discount_campaign_idx
  ON public.pos_sales(discount_campaign_id) WHERE discount_campaign_id IS NOT NULL;
