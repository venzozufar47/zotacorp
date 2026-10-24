/**
 * Pemakaian bahan TEORETIS satu cabang: produksi POS × resep. Dipakai untuk (a) kelas ABC opname (urutan biaya pemakaian)
 * dan (b) pemakaian harian otomatis bagi bahan yang parameter `avgDailyUsage`-nya belum diisi, supaya estimasi stok
 * ikut berkurang oleh pemakaian — tanpa itu estimasi hanya naik dan selisih opname selalu "besar".
 *
 * Teoretis, bukan terukur: bergantung pada produksi yang dicatat di POS dan resep yang tertaut. BUKAN "use server".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { posAccountFilterForCostingBrand } from "@/lib/costing/brands";
import { fetchUnitsMap, num } from "@/lib/costing/rows";
import { jakartaDateString } from "@/lib/utils/jakarta";

type DB = SupabaseClient<Database>;

/** Baris produksi dengan jumlah di atas ini dianggap salah ketik (pernah ada baris ratusan juta). */
const MAX_PLAUSIBLE_PRODUCTION_QTY = 100_000;

export interface MaterialUsage {
  /** Total pemakaian periode, dalam satuan pakai bahan (sudah termasuk susut). */
  qty: number;
  /** Biaya pemakaian periode (rupiah). */
  cost: number;
}

export interface TheoreticalUsage {
  days: number;
  byMaterial: Map<string, MaterialUsage>;
}

export async function loadTheoreticalUsage(
  supabase: DB,
  businessUnit: string,
  days = 30
): Promise<TheoreticalUsage> {
  const empty: TheoreticalUsage = { days, byMaterial: new Map() };
  const f = posAccountFilterForCostingBrand(businessUnit);
  let aq = supabase.from("bank_accounts").select("id").eq("business_unit", f.businessUnit).eq("bank", "cash");
  if (f.branch) aq = aq.eq("default_branch", f.branch);
  const { data: acct } = await aq.limit(1).maybeSingle();
  if (!acct) return empty;

  const cutoff = new Date(Date.now() - days * 86_400_000);
  const { data: moves } = await supabase
    .from("pos_stock_movements" as never)
    .select("product_id, variant_id, qty")
    .eq("bank_account_id", acct.id)
    .eq("type", "production")
    .gte("movement_date", jakartaDateString(cutoff))
    .gt("qty", 0)
    .lt("qty", MAX_PLAUSIBLE_PRODUCTION_QTY);
  const produced = (moves ?? []) as { product_id: string; variant_id: string | null; qty: number }[];
  if (produced.length === 0) return empty;

  const { data: prodRows } = await supabase
    .from("costing_products" as never)
    .select("id, pos_product_id, pos_variant_id, yield_qty")
    .eq("business_unit", businessUnit)
    .eq("is_active", true)
    .not("pos_product_id", "is", null);
  const products = (prodRows ?? []) as Record<string, unknown>[];
  if (products.length === 0) return empty;

  const productIds = products.map((p) => p.id as string);
  const [{ data: itemRows }, { data: matRows }, units] = await Promise.all([
    supabase
      .from("costing_recipe_items" as never)
      .select("product_id, material_id, qty, unit")
      .in("product_id", productIds),
    supabase
      .from("costing_materials" as never)
      .select("id, usage_unit, purchase_price, content_per_purchase, shrink_factor")
      .eq("business_unit", businessUnit),
    fetchUnitsMap(supabase),
  ]);
  const mats = new Map(((matRows ?? []) as Record<string, unknown>[]).map((m) => [m.id as string, m]));
  const itemsByProduct = new Map<string, Record<string, unknown>[]>();
  for (const it of (itemRows ?? []) as Record<string, unknown>[]) {
    const k = it.product_id as string;
    const arr = itemsByProduct.get(k) ?? [];
    arr.push(it);
    itemsByProduct.set(k, arr);
  }

  const out = new Map<string, MaterialUsage>();
  for (const p of products) {
    const yieldQty = num(p.yield_qty);
    if (!(yieldQty > 0)) continue;
    // Total unit produksi yang cocok dengan produk costing ini.
    let made = 0;
    for (const mv of produced) {
      if (mv.product_id !== p.pos_product_id) continue;
      if (p.pos_variant_id && mv.variant_id !== p.pos_variant_id) continue;
      made += mv.qty;
    }
    if (made <= 0) continue;
    for (const it of itemsByProduct.get(p.id as string) ?? []) {
      const m = mats.get(it.material_id as string);
      if (!m) continue;
      const usageUnit = m.usage_unit as string;
      let perUnit = num(it.qty) / yieldQty;
      const ru = it.unit as string | null;
      if (ru && ru !== usageUnit) {
        const a = units.get(ru);
        const b = units.get(usageUnit);
        if (!a || !b || a.dimension !== b.dimension) continue; // tak bisa dikonversi: jangan menebak
        perUnit = (perUnit * a.to_base) / b.to_base;
      }
      const qty = made * perUnit * (1 + Math.max(0, num(m.shrink_factor)));
      const content = num(m.content_per_purchase);
      const unitCost = content > 0 ? num(m.purchase_price) / content : 0;
      const prev = out.get(it.material_id as string) ?? { qty: 0, cost: 0 };
      out.set(it.material_id as string, { qty: prev.qty + qty, cost: prev.cost + qty * unitCost });
    }
  }
  return { days, byMaterial: out };
}
