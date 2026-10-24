import type { CostingMaterialLite, UnitDef } from "@/lib/costing/calc";
import type { ImpactProduct } from "@/lib/costing/impact";
import type { CostingMaterial, CostingProductWithHpp, CostingUnit } from "@/lib/actions/costing.actions";

/** Data layar Master Bahan (wizard + matriks) → bentuk murni untuk `computeImpact` / `computeHpp`. */

export function materialLite(m: CostingMaterial): CostingMaterialLite {
  return {
    id: m.id,
    name: m.name,
    purchase_price: m.purchase_price,
    content_per_purchase: m.content_per_purchase,
    usage_unit: m.usage_unit,
    shrink_factor: m.shrink_factor,
  };
}

export function unitsMap(units: CostingUnit[]): Map<string, UnitDef> {
  return new Map(units.map((u) => [u.code, { dimension: u.dimension, to_base: u.to_base }]));
}

export function impactProducts(rows: CostingProductWithHpp[]): ImpactProduct[] {
  return rows.map((r) => ({
    id: r.product.id,
    name: r.product.name,
    cost: r.product,
    items: [...r.items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ material_id: i.material_id, qty: i.qty, unit: i.unit })),
  }));
}

/** Satuan yang boleh dipilih untuk takaran resep bahan ini: satuan pakai + satuan lain se-dimensi. */
export function recipeUnitChoices(usageUnit: string, units: CostingUnit[]): string[] {
  const own = units.find((u) => u.code === usageUnit);
  if (!own) return [usageUnit];
  const same = units.filter((u) => u.dimension === own.dimension).map((u) => u.code);
  return same.includes(usageUnit) ? same : [usageUnit, ...same];
}
