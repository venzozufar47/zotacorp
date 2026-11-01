/**
 * Bahan setengah jadi: bahan yang harganya mengikuti HPP sebuah produk costing (mis. "Ladyfinger (buat sendiri)" dari
 * resep ladyfinger). Modul murni, memakai `computeHpp` yang sama, supaya angka layar = angka tersimpan.
 *
 * Harga bahan setengah jadi = HPP per batch produk sumber; isi per kemasan = hasil per batch. Satu pcs jadi
 * hppBatch ÷ yield persis HPP per unit produk sumber, dan resep yang memakainya tidak perlu tahu bedanya dengan bahan biasa.
 * Resep sumber boleh memakai bahan setengah jadi lain (berlapis); dihitung berulang sampai stabil, dengan batas lintasan
 * supaya siklus tidak membuat hitungan tak berujung.
 */
import {
  computeHpp,
  type CostingMaterialLite,
  type ProductCostLite,
  type RecipeItemLite,
  type UnitDef,
} from "./calc.ts";

export interface DerivedLink {
  materialId: string;
  productId: string;
}

export interface DerivedPrice {
  materialId: string;
  /** HPP per batch produk sumber (rupiah). */
  purchasePrice: number;
  /** Hasil per batch produk sumber (satuan pakai). */
  contentPerPurchase: number;
}

const EPS = 1e-9;

export function resolveDerivedMaterials(args: {
  derived: DerivedLink[];
  productsById: Map<string, ProductCostLite>;
  itemsByProduct: Map<string, RecipeItemLite[]>;
  /** Semua bahan satu brand (termasuk bahan setengah jadi itu sendiri, dengan harga tersimpan). */
  materials: Map<string, CostingMaterialLite>;
  units?: Map<string, UnitDef>;
}): Map<string, DerivedPrice> {
  const { derived, productsById, itemsByProduct, units } = args;
  const mats = new Map(args.materials);
  const out = new Map<string, DerivedPrice>();
  // Kedalaman berlapis paling banyak sebanyak bahan setengah jadi; +1 untuk lintasan pemastian stabil.
  for (let pass = 0; pass <= derived.length; pass += 1) {
    let changed = false;
    for (const d of derived) {
      const cost = productsById.get(d.productId);
      const current = mats.get(d.materialId);
      if (!cost || !current || !(cost.yield_qty > 0)) continue;
      const { hppBatch } = computeHpp(itemsByProduct.get(d.productId) ?? [], cost, mats, units);
      if (
        Math.abs(hppBatch - current.purchase_price) > EPS ||
        Math.abs(cost.yield_qty - current.content_per_purchase) > EPS
      ) {
        mats.set(d.materialId, { ...current, purchase_price: hppBatch, content_per_purchase: cost.yield_qty });
        changed = true;
      }
      out.set(d.materialId, { materialId: d.materialId, purchasePrice: hppBatch, contentPerPurchase: cost.yield_qty });
    }
    if (!changed) break;
  }
  return out;
}
