/**
 * HPP (Harga Pokok Penjualan) — kalkulasi murni.
 *
 * BUKAN "use server": diimpor client (breakdown live di builder) maupun
 * server (validasi + daftar produk), supaya angka yang ditampilkan ==
 * angka yang dihitung ulang di server. Semua rumus mengikuti PRD Bagian
 * 8.
 *
 * Prinsip presisi: hitung dengan angka penuh (JS number), pembulatan
 * HANYA di harga jual final + di tampilan. HPP tidak pernah disimpan;
 * selalu diturunkan dari komponen ini.
 */

export type OverheadMethod = "persen" | "nominal";
export type PriceMethod = "margin" | "markup";
export type RoundingMode = "floor" | "nearest" | "ceil";
export type LaborMode = "nominal" | "hourly";

/** Data bahan yang relevan untuk costing (subset dari costing_materials). */
export interface CostingMaterialLite {
  id: string;
  name: string;
  /** Harga beli per satuan beli (rupiah). */
  purchase_price: number;
  /** Isi per satuan beli dalam satuan pakai (mis. 25000 gram per sak). */
  content_per_purchase: number;
  /** Label satuan pakai (mis. "gram"). Hanya untuk tampilan. */
  usage_unit: string;
}

/** Satu baris resep. `qty` dalam satuan pakai bahannya. */
export interface RecipeItemLite {
  material_id: string;
  qty: number;
  /** Faktor susut produksi (fraksi, 0 = tanpa susut). */
  shrink_factor: number;
}

/** Field biaya + pricing sebuah produk (subset dari costing_products). */
export interface ProductCostLite {
  /** Jumlah hasil per batch (unit). Harus > 0. */
  yield_qty: number;
  /** TKL nominal per batch (rupiah) — dipakai saat labor_mode='nominal'. */
  labor: number;
  /** 'nominal' = pakai `labor`; 'hourly' = labor_rate × labor_hours. */
  labor_mode: LaborMode;
  labor_rate: number;
  labor_hours: number;
  /** Kemasan per batch (rupiah). */
  packaging: number;
  overhead_method: OverheadMethod;
  /** Fraksi (0.15 = 15%) — dipakai bila overhead_method='persen'. */
  overhead_percent: number;
  /** Rupiah — dipakai bila overhead_method='nominal'. */
  overhead_nominal: number;
  price_method: PriceMethod;
  /** Fraksi target (0.40 = 40%). Margin atas harga jual, markup atas HPP. */
  target_percent: number;
  /** Kelipatan pembulatan harga jual (mis. 500/1000). 1 = tanpa bulat. */
  rounding_unit: number;
  rounding_mode: RoundingMode;
}

/** Harga per satuan pakai (mis. Rp/gram). */
export function usageUnitPrice(m: CostingMaterialLite): number {
  if (!(m.content_per_purchase > 0)) return 0;
  return m.purchase_price / m.content_per_purchase;
}

/** Bulatkan `value` ke kelipatan `unit` sesuai `mode`. `unit<=1` → apa
 *  adanya. Pola sama dgn `applyDiscount` (src/lib/pos/discount.ts). */
export function roundToUnit(
  value: number,
  unit: number,
  mode: RoundingMode
): number {
  if (!(unit > 1)) return value;
  const q = value / unit;
  const r = mode === "floor" ? Math.floor(q) : mode === "ceil" ? Math.ceil(q) : Math.round(q);
  return r * unit;
}

export interface ComponentBreakdown {
  material_id: string;
  /** Null bila bahan tak ditemukan (dihapus) — biaya dihitung 0. */
  name: string | null;
  qty: number;
  unitPrice: number;
  shrink_factor: number;
  cost: number;
}

export interface HppBreakdown {
  components: ComponentBreakdown[];
  totalMaterial: number;
  packaging: number;
  labor: number;
  overhead: number;
  hppBatch: number;
  /** HPP per unit (hppBatch / yield). */
  hppUnit: number;
  /** Harga jual sebelum pembulatan. Null bila input tak valid (mis.
   *  margin target ≥ 100% → pembagian nol/negatif). */
  sellingPrice: number | null;
  /** Harga jual setelah pembulatan. Null bila sellingPrice null. */
  finalPrice: number | null;
  /** finalPrice − hppUnit. Null bila finalPrice null. */
  marginRupiah: number | null;
  /** marginRupiah / finalPrice (fraksi). Null bila finalPrice null/0. */
  marginPercent: number | null;
  /** Kode error untuk UI; null bila valid. */
  error: "yield_invalid" | "margin_too_high" | null;
}

/**
 * Hitung breakdown HPP + harga jual lengkap. `materialsById` menyediakan
 * harga bahan terkini — pass harga yang diedit (belum disimpan) untuk
 * simulasi "produk terdampak".
 */
export function computeHpp(
  items: RecipeItemLite[],
  cost: ProductCostLite,
  materialsById: Map<string, CostingMaterialLite>
): HppBreakdown {
  const components: ComponentBreakdown[] = items.map((it) => {
    const m = materialsById.get(it.material_id);
    const unitPrice = m ? usageUnitPrice(m) : 0;
    const shrink = it.shrink_factor > 0 ? it.shrink_factor : 0;
    const cost = it.qty * unitPrice * (1 + shrink);
    return {
      material_id: it.material_id,
      name: m ? m.name : null,
      qty: it.qty,
      unitPrice,
      shrink_factor: shrink,
      cost,
    };
  });

  const totalMaterial = components.reduce((s, c) => s + c.cost, 0);
  const overhead =
    cost.overhead_method === "persen"
      ? totalMaterial * cost.overhead_percent
      : cost.overhead_nominal;
  // TKL efektif: nominal langsung, atau tarif × jam.
  const labor =
    cost.labor_mode === "hourly"
      ? cost.labor_rate * cost.labor_hours
      : cost.labor;
  const hppBatch = totalMaterial + cost.packaging + labor + overhead;

  const base = {
    components,
    totalMaterial,
    packaging: cost.packaging,
    labor,
    overhead,
    hppBatch,
  };

  if (!(cost.yield_qty > 0)) {
    return {
      ...base,
      hppUnit: 0,
      sellingPrice: null,
      finalPrice: null,
      marginRupiah: null,
      marginPercent: null,
      error: "yield_invalid",
    };
  }

  const hppUnit = hppBatch / cost.yield_qty;

  // Margin dihitung ATAS HARGA JUAL → target ≥ 100% membuat pembagi
  // (1 − target) ≤ 0 (harga jual tak terhingga/negatif). Markup atas HPP
  // tidak punya batas ini.
  if (cost.price_method === "margin" && cost.target_percent >= 1) {
    return {
      ...base,
      hppUnit,
      sellingPrice: null,
      finalPrice: null,
      marginRupiah: null,
      marginPercent: null,
      error: "margin_too_high",
    };
  }

  const sellingPrice =
    cost.price_method === "margin"
      ? hppUnit / (1 - cost.target_percent)
      : hppUnit * (1 + cost.target_percent);
  const finalPrice = roundToUnit(
    sellingPrice,
    cost.rounding_unit,
    cost.rounding_mode
  );
  const marginRupiah = finalPrice - hppUnit;
  const marginPercent = finalPrice > 0 ? marginRupiah / finalPrice : null;

  return {
    ...base,
    hppUnit,
    sellingPrice,
    finalPrice,
    marginRupiah,
    marginPercent,
    error: null,
  };
}
