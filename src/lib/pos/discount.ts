/**
 * Pure math helper untuk perhitungan diskon POS — dipakai oleh
 * `createPosSale` (server) maupun `POSClient` (client) supaya angka
 * yang ditampilkan di cart selalu == angka yang tersimpan.
 *
 * Aturan:
 *   1. raw = grossTotal × (1 − percent/100)
 *   2. rounded = roundToUnit(raw, unit, mode)
 *   3. clamp [0, grossTotal] — diskon tidak boleh negatif atau >gross
 *   4. kalau grossTotal < unit, skip diskon (final = gross, discount = 0)
 *      → menghindari "harga 800 → diskon 800" yang absurd.
 */

export type RoundingMode = "floor" | "nearest" | "ceil";

export interface DiscountCampaignLite {
  percentOff: number;
  roundingUnit: number;
  roundingMode: RoundingMode;
}

export function applyDiscount(
  grossTotal: number,
  c: DiscountCampaignLite
): { finalTotal: number; discountAmount: number } {
  if (grossTotal <= 0) return { finalTotal: 0, discountAmount: 0 };
  if (grossTotal < c.roundingUnit) {
    return { finalTotal: grossTotal, discountAmount: 0 };
  }
  const raw = grossTotal * (1 - c.percentOff / 100);
  let rounded: number;
  if (c.roundingMode === "floor") {
    rounded = Math.floor(raw / c.roundingUnit) * c.roundingUnit;
  } else if (c.roundingMode === "ceil") {
    rounded = Math.ceil(raw / c.roundingUnit) * c.roundingUnit;
  } else {
    rounded = Math.round(raw / c.roundingUnit) * c.roundingUnit;
  }
  const finalTotal = Math.max(0, Math.min(grossTotal, rounded));
  return {
    finalTotal,
    discountAmount: grossTotal - finalTotal,
  };
}
