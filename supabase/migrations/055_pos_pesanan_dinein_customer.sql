-- POS pesanan (deferred payment), customer name di setiap sale, +
-- dine-in / take-away tag per sale dengan opsional override per item.
--
-- Stock decrement tetap immediate via pos_sale_items (existing opname
-- aggregation include semua sale dengan voided_at IS NULL). Cashflow
-- transaction baru dibuat saat sale berstatus paid (cash/qris) —
-- saat pesanan masih pending atau settled via admin, tidak ada
-- cashflow event POS.

ALTER TABLE public.pos_sales
  ADD COLUMN customer_name TEXT,
  ADD COLUMN fulfillment_type TEXT
    CHECK (fulfillment_type IN ('dine_in','take_away')),
  ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid','pending')),
  ADD COLUMN pending_at TIMESTAMPTZ,
  ADD COLUMN settled_at TIMESTAMPTZ,
  ADD COLUMN settled_via TEXT
    CHECK (settled_via IN ('cash','qris','admin')),
  ADD COLUMN settled_by UUID REFERENCES public.profiles(id);

-- Relax payment_method CHECK supaya boleh 'pending' (saat sale
-- pesanan dibuat) DAN 'admin' (saat settle via admin/WhatsApp).
ALTER TABLE public.pos_sales
  DROP CONSTRAINT IF EXISTS pos_sales_payment_method_check;
ALTER TABLE public.pos_sales
  ADD CONSTRAINT pos_sales_payment_method_check
  CHECK (payment_method IN ('cash','qris','pending','admin'));

ALTER TABLE public.pos_sale_items
  ADD COLUMN fulfillment_type TEXT
    CHECK (fulfillment_type IN ('dine_in','take_away'));

CREATE INDEX pos_sales_pending_idx
  ON public.pos_sales(bank_account_id, pending_at DESC)
  WHERE payment_status = 'pending' AND voided_at IS NULL;
