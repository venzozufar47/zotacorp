-- Kolom delegasi: admin assign transaksi ke karyawan tertentu
-- (mis. kepala studio) untuk kategorisasi manual, khusus transaksi
-- yang tidak bisa di-infer otomatis (Shopee/Tokopedia tanpa keterangan).
--
-- Workflow:
--   1. Rule engine tag transaksi ambiguous sebagai category="Needs Assignment".
--   2. Admin pilih assignee (kepala studio) → set assigned_to_user_id.
--   3. Assignee buka halaman queue mereka, set category & branch yang benar,
--      kategori bukan lagi "Needs Assignment" → assigned_to_user_id boleh
--      dibiarkan (audit trail siapa yang menangani).
--
-- NULL = belum di-assign (umum: rule mark Needs Assignment, admin belum
-- pilih siapa yang handle).

ALTER TABLE public.cashflow_transactions
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cashflow_tx_assigned_to
  ON public.cashflow_transactions (assigned_to_user_id)
  WHERE assigned_to_user_id IS NOT NULL;

COMMENT ON COLUMN public.cashflow_transactions.assigned_to_user_id IS
  'User (mis. kepala studio) yang di-delegasi admin untuk mengisi kategori/cabang transaksi ambiguous (Shopee/Tokopedia/QRIS dsb).';
