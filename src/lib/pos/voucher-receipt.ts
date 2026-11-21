/**
 * Struk voucher promo yang dicetak di muka (sebelum toko buka), satu struk = satu pcs.
 * Isinya sama dengan struk kasir biasa untuk pembelian promo: harga normal, potongan, total harga promo.
 * Beda: tanpa nama pemesan/mode makan, dan metode bayar "Qris / Cash" agar kasir tinggal mencoret salah satu.
 */

import type { ReceiptData } from "./receipt";

export interface VoucherReceiptProduct {
  name: string;
  /** Harga normal per pcs (tercetak sebagai subtotal). */
  normalPrice: number;
  /** Harga promo per pcs (tercetak sebagai total). */
  promoPrice: number;
}

/** Kunci satu SKU voucher: produk polos = productId, produk bervarian = productId|variantId. */
export function voucherKey(productId: string, variantId: string | null | undefined): string {
  return variantId ? `${productId}|${variantId}` : productId;
}

/** Teks metode bayar di struk voucher; kasir mencoret salah satu. */
export const VOUCHER_METHOD_TEXT = "Qris / Cash";

/** Pcs struk per sekali kirim ke printer; kiriman besar membuat intent RawBT terlalu panjang. */
export const VOUCHER_PRINT_BATCH = 10;

/** Bagian tetap struk (header, alamat, waktu, kasir, footer) diisi pemanggil lewat `base`. */
export function voucherReceiptData(
  base: Pick<ReceiptData, "header" | "branch" | "address" | "datetime" | "cashierName" | "footer" | "wifiName" | "wifiPassword" | "labels">,
  p: VoucherReceiptProduct
): ReceiptData {
  const total = Math.min(p.promoPrice, p.normalPrice);
  return {
    ...base,
    customerName: null,
    fulfillment: null,
    items: [{ name: p.name, qty: 1, subtotal: p.normalPrice }],
    grossTotal: p.normalPrice,
    discountAmount: p.normalPrice - total,
    total,
    method: "pending",
    methodText: VOUCHER_METHOD_TEXT,
    saleShortId: null,
  };
}

/** Sambung beberapa array byte jadi satu. */
export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of parts) {
    out.set(a, at);
    at += a.length;
  }
  return out;
}
