-- Alasan penarikan stok baru: "Order Admin Custom Cake" (stok diambil admin untuk pesanan custom cake).
-- Bukan susut: kelompok "terpakai". Nilai lama (termasuk gagal_produksi yang masih diizinkan di produksi) dipertahankan.
ALTER TABLE public.pos_stock_movements
  DROP CONSTRAINT IF EXISTS pos_stock_movements_withdrawal_reason_check;
ALTER TABLE public.pos_stock_movements
  ADD CONSTRAINT pos_stock_movements_withdrawal_reason_check
  CHECK (
    withdrawal_reason IS NULL
    OR (
      type = 'withdrawal'
      AND withdrawal_reason IN (
        'expired', 'rusak', 'gagal_produksi', 'testing', 'konten', 'konsumsi_internal',
        'hadiah_kompensasi', 'order_admin_cake', 'konversi_sku', 'koreksi_input', 'lainnya'
      )
    )
  );
