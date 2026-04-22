/**
 * Upload foto bukti QRIS saat checkout di POSClient. Aman menyala —
 * createPosSale sekarang link cashflow_transaction_id via admin client
 * (fix RLS di commit 91cbd7f), jadi attachPosQrisReceipt langsung
 * menemukan tx-nya, tidak perlu fuzzy relink.
 */
export const QRIS_RECEIPT_AT_CHECKOUT = true;

/**
 * Upload ulang bukti QRIS dari /pos/riwayat (badge 'Bukti'/'Belum').
 * DINONAKTIFKAN sementara: sale lama yang orphan (cashflow_transaction_id
 * null akibat RLS bug sebelum fix) perlu fuzzy-match ke tx cashflow.
 * Match by (date + time) belum stabil saat admin edit nominal di ledger.
 * Flip ke `true` setelah lookup di pos-receipt.actions.ts verified.
 */
export const QRIS_RECEIPT_FROM_RIWAYAT = true;
