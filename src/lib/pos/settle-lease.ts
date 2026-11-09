/**
 * "Klaim" pelunasan pesanan POS (docs/STATE_MACHINES.md SM-2).
 *
 * Invarian data: pesanan yang masih `payment_status = 'pending'` selalu
 * punya `settled_at IS NULL` (terverifikasi di produksi 2026-11-09). Selama
 * pelunasan berjalan, `settled_at` diisi lebih dulu sebagai klaim, sehingga
 * pelunasan kedua (klik ganda, dua kasir), edit, dan pembatalan pada pesanan
 * yang sama tertolak alih-alih ikut mencatat kas. Klaim yang tertinggal
 * karena proses mati di tengah jalan kedaluwarsa setelah SETTLE_LEASE_MS.
 */

export const SETTLE_LEASE_MS = 2 * 60 * 1000;

/** Filter PostgREST `or`: belum ada klaim, atau klaimnya sudah kedaluwarsa. */
export function settleLeaseFreeFilter(now: Date): string {
  const cutoff = new Date(now.getTime() - SETTLE_LEASE_MS).toISOString();
  return `settled_at.is.null,settled_at.lt.${cutoff}`;
}
