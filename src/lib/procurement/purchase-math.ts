/**
 * Hitungan murni nota belanja pengadaan — dipakai form (pratinjau langsung) dan server (hitung ulang,
 * angka klien tidak pernah dipercaya). Tanpa akses database.
 */
import type { UnitDef } from "@/lib/costing/calc";

/** Harga beli menyimpang lebih dari ini dari harga acuan → tidak mengubah acuan otomatis, minta tinjau admin. */
export const PRICE_REVIEW_THRESHOLD = 0.3;

export interface MaterialUnits {
  /** Satuan beli (teks bebas, mis. "sak", "dus"). */
  purchaseUnit: string;
  /** Isi per satuan beli dalam satuan pakai (mis. 25000 gram per sak). */
  contentPerPurchase: number;
  /** Satuan pakai (kode costing_units bila ada, mis. "gram"). */
  usageUnit: string;
}

export interface QtyConversion {
  qtyPurchaseUnits: number;
  qtyUsageUnits: number;
}

/**
 * Qty yang diketik petugas → satuan beli & satuan pakai. `unit` boleh: satuan beli bahan, satuan pakai bahan,
 * atau satuan lain di dimensi yang sama dengan satuan pakai (mis. kg untuk bahan bersatuan gram).
 * null = satuan tidak bisa dikonversi.
 */
export function convertQty(
  qty: number,
  unit: string,
  m: MaterialUnits,
  units: Map<string, UnitDef>
): QtyConversion | null {
  if (!(qty > 0) || !(m.contentPerPurchase > 0)) return null;
  const u = unit.trim().toLowerCase();
  let usage: number | null = null;
  const pu = m.purchaseUnit.trim().toLowerCase();
  const uu = m.usageUnit.trim().toLowerCase();
  // Data lama kadang punya satuan beli = satuan pakai (mis. beli "gram", isi 1000 gram): satuan itu dibaca sebagai
  // satuan pakai, bukan dikali isi — kalau tidak, 500 gram terhitung 500.000 gram.
  if (u === uu) usage = qty;
  else if (u === pu) usage = qty * m.contentPerPurchase;
  else {
    const from = units.get(u);
    const to = units.get(m.usageUnit.trim().toLowerCase());
    if (from && to && from.dimension === to.dimension && to.to_base > 0) {
      usage = (qty * from.to_base) / to.to_base;
    }
  }
  if (usage == null || !(usage > 0)) return null;
  return { qtyUsageUnits: usage, qtyPurchaseUnits: usage / m.contentPerPurchase };
}

/** Pilihan satuan yang boleh diketik untuk satu bahan (urutan: beli, pakai, setara). */
export function unitChoices(m: MaterialUnits, units: Map<string, UnitDef>): string[] {
  const out = [m.purchaseUnit, m.usageUnit];
  const to = units.get(m.usageUnit.trim().toLowerCase());
  if (to) {
    for (const [code, def] of units) {
      if (def.dimension === to.dimension && !out.some((o) => o.toLowerCase() === code)) out.push(code);
    }
  }
  return out.filter((v, i) => v && out.findIndex((o) => o.toLowerCase() === v.toLowerCase()) === i);
}

/** Harga per satuan pakai dari total yang dibayar. */
export function unitPriceUsage(total: number, qtyUsageUnits: number): number {
  return qtyUsageUnits > 0 ? total / qtyUsageUnits : 0;
}

/** Selisih relatif harga bayar vs acuan per satuan pakai (+0,2 = 20% lebih mahal). null bila acuan tak ada. */
export function priceDeviation(paidPerUsage: number, refPerUsage: number): number | null {
  if (!(refPerUsage > 0) || !(paidPerUsage > 0)) return null;
  return paidPerUsage / refPerUsage - 1;
}

export function needsPriceReview(deviation: number | null): boolean {
  return deviation != null && Math.abs(deviation) > PRICE_REVIEW_THRESHOLD;
}

/**
 * Harga acuan baru (per satuan BELI) sebagai rata-rata tertimbang:
 *   (stok lama × harga acuan + pembelian × harga bayar) / (stok lama + pembelian)
 * `stockUsage` = estimasi stok sebelum pembelian (satuan pakai); null/≤0 → pakai harga bayar saja.
 */
export function weightedAveragePurchasePrice(p: {
  stockUsage: number | null;
  contentPerPurchase: number;
  refPricePerPurchase: number;
  boughtPurchaseUnits: number;
  paidPerPurchaseUnit: number;
}): number {
  const stockPurchase =
    p.stockUsage != null && p.stockUsage > 0 && p.contentPerPurchase > 0
      ? p.stockUsage / p.contentPerPurchase
      : 0;
  const denom = stockPurchase + p.boughtPurchaseUnits;
  if (!(denom > 0)) return p.paidPerPurchaseUnit;
  return (stockPurchase * p.refPricePerPurchase + p.boughtPurchaseUnits * p.paidPerPurchaseUnit) / denom;
}
