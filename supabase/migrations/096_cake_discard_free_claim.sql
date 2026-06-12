-- Cake orders — status "dibuang" (discarded) + "klaim gratis karyawan".
--
-- 1. STATUS 'discarded': cake yang SUDAH diproduksi lalu dibuang (waste),
--    berbeda dari 'cancelled' (dibatalkan sebelum jadi). Status terminal —
--    di laporan keuangan & bonus dekorator diperlakukan seperti 'cancelled'
--    (DIKECUALIKAN), tapi tetap distinct supaya bisa dilacak sebagai
--    kerugian/waste operasional.
--
-- 2. FREE CLAIM: opsi "klaim gratis karyawan" — cake diberikan gratis (perk
--    karyawan / giveaway). Saat aktif, total_idr dipaksa 0 & payment_status
--    'paid' tanpa payment leg (lihat setCakeOrderFreeClaim). Kolom audit
--    menyimpan siapa & kapan supaya bisa di-undo + dilaporkan.

-- 1. Tambah 'discarded' ke CHECK status.
ALTER TABLE public.cake_orders
  DROP CONSTRAINT IF EXISTS cake_orders_status_check;
ALTER TABLE public.cake_orders
  ADD CONSTRAINT cake_orders_status_check CHECK (
    status IN (
      'submitted', 'in_progress', 'ready',
      'delivering', 'done', 'cancelled', 'discarded'
    )
  );

-- 2. Kolom klaim gratis karyawan.
ALTER TABLE public.cake_orders
  ADD COLUMN IF NOT EXISTS free_claim boolean NOT NULL DEFAULT false;
ALTER TABLE public.cake_orders
  ADD COLUMN IF NOT EXISTS free_claim_at timestamptz;
ALTER TABLE public.cake_orders
  ADD COLUMN IF NOT EXISTS free_claim_by uuid REFERENCES auth.users(id);
