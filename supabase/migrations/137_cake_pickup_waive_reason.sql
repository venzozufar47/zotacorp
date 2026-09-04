-- Serah terima kue: dua opsi baru selain QRIS/Cash saat sisa tagihan
-- belum dibayar — "Cake Konten" dan "Lainnya" (alasan bebas). Keduanya
-- BUKAN metode bayar, melainkan alasan kenapa kue dilepas TANPA
-- ditagih sisanya. Tidak ada payment leg / transaksi kas yang ditulis
-- untuk jalur ini — konsekuensinya, cake ini otomatis TIDAK ikut
-- terhitung di bonus custom cake Admin Haengbocake (yang basisnya
-- mutasi rekening/cake_order_payments), sama seperti pola pengakuan-
-- unpaid generik yang sudah ada sebelumnya.
--
-- Beda dari `free_claim` (096_cake_discard_free_claim): free_claim
-- memaksa total_idr=0 sejak awal (memang gratis dari awal transaksi).
-- Kolom ini tidak mengubah total_idr/paid_idr sama sekali — tagihan
-- aslinya tetap apa adanya, cuma ditandai alasan kenapa sisanya
-- dilepas tanpa tertagih, supaya beda dari "lupa ditagih" biasa.

ALTER TABLE public.cake_orders
  ADD COLUMN IF NOT EXISTS pickup_waive_reason text;
ALTER TABLE public.cake_orders
  ADD COLUMN IF NOT EXISTS pickup_waive_note text;

COMMENT ON COLUMN public.cake_orders.pickup_waive_reason IS
  'Alasan sisa tagihan dilepas tanpa pelunasan saat serah-terima: cake_konten | lainnya. NULL = tidak ada (lunas normal, atau nunggak tanpa alasan tercatat lewat acknowledgeUnpaid generik).';
COMMENT ON COLUMN public.cake_orders.pickup_waive_note IS
  'Catatan bebas untuk alasan "lainnya". NULL untuk cake_konten atau saat pickup_waive_reason NULL.';

ALTER TABLE public.cake_orders
  DROP CONSTRAINT IF EXISTS cake_orders_pickup_waive_reason_check;
ALTER TABLE public.cake_orders
  ADD CONSTRAINT cake_orders_pickup_waive_reason_check
  CHECK (pickup_waive_reason IS NULL OR pickup_waive_reason IN ('cake_konten', 'lainnya'));
