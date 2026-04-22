/**
 * TEMPORARY FLAG: fitur upload foto bukti QRIS dinonaktifkan sementara
 * sampai auto-relink orphan sale stabil (match by date+time masih
 * mengandung edge case saat admin edit nominal di ledger). Kasir tetap
 * bisa transaksi QRIS tanpa foto; admin bisa attach bukti manual dari
 * /admin/finance. Set ke `true` setelah fix siap.
 *
 * Di-share antara POSClient (entry point upload saat sale) dan
 * /pos/riwayat page (badge upload ulang di history).
 */
export const QRIS_RECEIPT_ENABLED = false;
