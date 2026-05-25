-- Track apakah cancellation booking pakai opsi "forfeit" (uang hangus,
-- revenue tetap diakui Yeobo Booth) atau "refund" (uang dikembalikan
-- ke klien, ada reversing tx di cashflow). Sebelumnya hanya tercatat
-- implicit via ada/tidaknya refund cashflow_transactions; sekarang
-- explicit supaya UI bisa render badge tanpa join.
--
-- Nullable: tidak relevan untuk booking yang status != 'cancelled'.

ALTER TABLE public.yeobo_booth_bookings
  ADD COLUMN cancellation_kind text
    CHECK (cancellation_kind IS NULL OR cancellation_kind IN ('forfeit', 'refund'));

-- Backfill row historis: kalau ada refund tx di cashflow yang ter-link
-- ke booking ini lewat notes 'booking:<id>...refund', tandai 'refund';
-- selain itu 'forfeit' (revenue tetap di ledger).
UPDATE public.yeobo_booth_bookings b
SET cancellation_kind = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.cashflow_transactions tx
    WHERE tx.notes LIKE 'booking:' || b.id::text || '%refund%'
  ) THEN 'refund'
  ELSE 'forfeit'
END
WHERE b.status = 'cancelled'
  AND cancellation_kind IS NULL;
