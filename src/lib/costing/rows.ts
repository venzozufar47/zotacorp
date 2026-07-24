/**
 * Row-mapping + data-assembly bersama untuk modul costing.
 *
 * BUKAN "use server": mapper & `loadBrandCosting` dipakai baik oleh
 * server actions (costing.actions.ts) MAUPUN lib snapshot (snapshot.ts).
 * Sebelumnya keempat jalur ("muat produk+bahan+satuan+resep satu brand
 * lalu computeHpp") disalin terpisah; sekarang satu sumber.
 *
 * Tabel costing belum ada di generated types → `.from("x" as never)`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  computeHpp,
  type CostingMaterialLite,
  type UnitDef,
} from "@/lib/costing/calc";
import type {
  CostingMaterial,
  CostingProduct,
  CostingRecipeItem,
  CostingProductWithHpp,
} from "@/lib/actions/costing.actions";

type DB = SupabaseClient<Database>;

/** Koersi kolom `numeric` (PostgREST kembalikan string) → number. */
export function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function mapMaterial(r: Record<string, unknown>): CostingMaterial {
  return {
    id: r.id as string,
    business_unit: r.business_unit as string,
    name: r.name as string,
    category: (r.category as string | null) ?? null,
    purchase_unit: r.purchase_unit as string,
    purchase_price: num(r.purchase_price),
    content_per_purchase: num(r.content_per_purchase),
    usage_unit: r.usage_unit as string,
    price_updated_at: r.price_updated_at as string,
    is_active: r.is_active as boolean,
  };
}

export function mapItem(r: Record<string, unknown>): CostingRecipeItem {
  return {
    id: r.id as string,
    product_id: r.product_id as string,
    material_id: r.material_id as string,
    qty: num(r.qty),
    shrink_factor: num(r.shrink_factor),
    sort_order: num(r.sort_order),
    unit: (r.unit as string | null) ?? null,
  };
}

export function mapProduct(r: Record<string, unknown>): CostingProduct {
  return {
    id: r.id as string,
    business_unit: r.business_unit as string,
    name: r.name as string,
    category: (r.category as string | null) ?? null,
    type: r.type as "resep" | "paket_jasa",
    yield_qty: num(r.yield_qty),
    yield_unit: (r.yield_unit as string | null) ?? null,
    labor: num(r.labor),
    labor_mode: (r.labor_mode as CostingProduct["labor_mode"]) ?? "nominal",
    labor_rate: num(r.labor_rate),
    labor_hours: num(r.labor_hours),
    packaging: num(r.packaging),
    overhead_method: r.overhead_method as CostingProduct["overhead_method"],
    overhead_percent: num(r.overhead_percent),
    overhead_nominal: num(r.overhead_nominal),
    crew_fee: num(r.crew_fee),
    transport: num(r.transport),
    depreciation_per_event: num(r.depreciation_per_event),
    price_method: r.price_method as CostingProduct["price_method"],
    target_percent: num(r.target_percent),
    rounding_unit: num(r.rounding_unit),
    rounding_mode: r.rounding_mode as CostingProduct["rounding_mode"],
    is_active: r.is_active as boolean,
    pos_product_id: (r.pos_product_id as string | null) ?? null,
    pos_variant_id: (r.pos_variant_id as string | null) ?? null,
  };
}

export function toLite(m: CostingMaterial): CostingMaterialLite {
  return {
    id: m.id,
    name: m.name,
    purchase_price: m.purchase_price,
    content_per_purchase: m.content_per_purchase,
    usage_unit: m.usage_unit,
  };
}

export async function fetchUnitsMap(supabase: DB): Promise<Map<string, UnitDef>> {
  const { data } = await supabase
    .from("costing_units" as never)
    .select("code, dimension, to_base");
  const m = new Map<string, UnitDef>();
  for (const r of (data ?? []) as Record<string, unknown>[])
    m.set(r.code as string, {
      dimension: r.dimension as "mass" | "volume" | "count",
      to_base: num(r.to_base),
    });
  return m;
}

/** Breakdown HPP dari komponen tersimpan. */
export function breakdownFor(
  product: CostingProduct,
  items: CostingRecipeItem[],
  materialsById: Map<string, CostingMaterialLite>,
  unitsByCode?: Map<string, UnitDef>
) {
  return computeHpp(
    items.map((it) => ({
      material_id: it.material_id,
      qty: it.qty,
      shrink_factor: it.shrink_factor,
      unit: it.unit,
    })),
    product,
    materialsById,
    unitsByCode
  );
}

export interface BrandCosting {
  products: CostingProduct[];
  itemsByProduct: Map<string, CostingRecipeItem[]>;
  materialsById: Map<string, CostingMaterialLite>;
  unitsByCode: Map<string, UnitDef>;
}

/**
 * Muat semua input HPP satu brand: produk (+ opsi hanya aktif) + bahan +
 * satuan (paralel) lalu resep. Satu sumber untuk list/dampak/snapshot/
 * apply. Materials & products di-scope per brand (invariant se-brand
 * dijaga di add/updateRecipeItem).
 */
export async function loadBrandCosting(
  supabase: DB,
  opts: { businessUnit: string; activeProductsOnly?: boolean }
): Promise<BrandCosting> {
  let pq = supabase
    .from("costing_products" as never)
    .select("*")
    .eq("business_unit", opts.businessUnit)
    .order("name", { ascending: true });
  if (opts.activeProductsOnly) pq = pq.eq("is_active", true);

  const [{ data: prodRows }, { data: matRows }, unitsByCode] = await Promise.all([
    pq,
    supabase
      .from("costing_materials" as never)
      .select("*")
      .eq("business_unit", opts.businessUnit),
    fetchUnitsMap(supabase),
  ]);

  const products = ((prodRows ?? []) as Record<string, unknown>[]).map(mapProduct);
  const materialsById = new Map(
    ((matRows ?? []) as Record<string, unknown>[]).map((r) => {
      const m = mapMaterial(r);
      return [m.id, toLite(m)] as const;
    })
  );

  const itemsByProduct = new Map<string, CostingRecipeItem[]>();
  const productIds = products.map((p) => p.id);
  if (productIds.length > 0) {
    const { data: itemRows } = await supabase
      .from("costing_recipe_items" as never)
      .select("*")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true });
    for (const r of (itemRows ?? []) as Record<string, unknown>[]) {
      const it = mapItem(r);
      const arr = itemsByProduct.get(it.product_id) ?? [];
      arr.push(it);
      itemsByProduct.set(it.product_id, arr);
    }
  }

  return { products, itemsByProduct, materialsById, unitsByCode };
}

/** Turunkan CostingProductWithHpp[] dari data yang sudah dimuat. */
export function computeAll(loaded: BrandCosting): CostingProductWithHpp[] {
  return loaded.products.map((product) => {
    const items = loaded.itemsByProduct.get(product.id) ?? [];
    return {
      product,
      items,
      breakdown: breakdownFor(
        product,
        items,
        loaded.materialsById,
        loaded.unitsByCode
      ),
    };
  });
}
