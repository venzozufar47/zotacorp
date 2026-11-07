/**
 * Pemuat data untuk laporan Kebocoran Bahan satu brand. BUKAN "use server": dipanggil dari server action yang sudah
 * lewat gerbang admin. Rumusnya ada di `leakage.ts`; di sini hanya merakit masukan.
 *
 * Pemakaian teoretis per HARI dihitung ulang di sini (produksi POS × resep, termasuk susut), bukan memakai
 * `usage.ts`, karena laporan perlu jumlah per tanggal untuk tiap pasangan opname, sedangkan `usage.ts` hanya
 * menjumlah satu jendela. Rumus konversi satuan dan susut sengaja sama dengan `usage.ts`.
 * Bahan setengah jadi (`source_product_id`) diurai satu tingkat ke bahan bakunya, supaya bahan baku itu tidak tampak
 * bocor hanya karena dipakai lewat resep setengah jadi.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { posAccountFilterForCostingBrand } from "@/lib/costing/brands";
import { fetchUnitsMap, num } from "@/lib/costing/rows";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { loadOpnameHistory } from "./rows";
import { computeLeakage, type CountPoint, type LeakageReport, type LeakMaterial, type ReceiptPoint } from "./leakage";

type DB = SupabaseClient<Database>;
type Row = Record<string, unknown>;

/** Sama dengan `usage.ts`: baris produksi sebesar ini dianggap salah ketik. */
const MAX_PLAUSIBLE_PRODUCTION_QTY = 100_000;
const PAGE = 1000;

async function paged(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await fetchPage(from, from + PAGE - 1);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function loadLeakageReport(
  supabase: DB,
  businessUnit: string,
  rangeDays: number | null
): Promise<LeakageReport> {
  const today = jakartaDateString(new Date());
  const fromDate = rangeDays ? jakartaDateString(new Date(Date.now() - rangeDays * 86_400_000)) : null;

  const [{ data: matRows }, history] = await Promise.all([
    supabase
      .from("costing_materials" as never)
      .select("id, name, category, usage_unit, purchase_price, content_per_purchase, shrink_factor, source_product_id")
      .eq("business_unit", businessUnit)
      .eq("is_active", true),
    loadOpnameHistory(supabase, businessUnit),
  ]);
  const allMats = (matRows ?? []) as Row[];
  const matById = new Map(allMats.map((m) => [m.id as string, m]));
  const unitCostOf = (m: Row) => {
    const content = num(m.content_per_purchase);
    return content > 0 ? num(m.purchase_price) / content : 0;
  };
  const materials: LeakMaterial[] = allMats
    .filter((m) => !m.source_product_id)
    .map((m) => ({
      id: m.id as string,
      name: m.name as string,
      category: (m.category as string | null) ?? null,
      unit: m.usage_unit as string,
      unitCost: unitCostOf(m),
    }));
  const reportable = new Set(materials.map((m) => m.id));

  const headById = new Map(history.opnames.map((o) => [o.id, o]));
  const counts: CountPoint[] = [];
  for (const it of history.items) {
    const head = headById.get(it.opname_id as string);
    const mid = it.material_id as string;
    if (!head || !reportable.has(mid)) continue;
    const atMs = Date.parse(head.created_at);
    if (!Number.isFinite(atMs)) continue;
    counts.push({
      materialId: mid,
      atMs,
      date: head.opname_date,
      qty: num(it.physical_qty),
      expected: it.expected_qty == null ? null : num(it.expected_qty),
      reason: (it.variance_reason as string | null) ?? null,
    });
  }
  if (counts.length === 0)
    return computeLeakage({
      materials,
      counts,
      receipts: [],
      dailyUsage: new Map(),
      fromDate,
      today,
    });

  const firstAtMs = counts.reduce((m, c) => Math.min(m, c.atMs), Number.POSITIVE_INFINITY);
  const firstDate = counts.reduce((m, c) => (c.date < m ? c.date : m), counts[0].date);

  const receiptRows = await paged((from, to) =>
    supabase
      .from("costing_material_receipts" as never)
      .select("material_id, qty_usage_units, arrived_at")
      .eq("business_unit", businessUnit)
      .gt("arrived_at", new Date(firstAtMs).toISOString())
      .order("arrived_at")
      .order("id")
      .range(from, to)
  );
  const receipts: ReceiptPoint[] = [];
  for (const r of receiptRows) {
    const atMs = Date.parse(r.arrived_at as string);
    if (Number.isFinite(atMs))
      receipts.push({
        materialId: r.material_id as string,
        atMs,
        qty: num(r.qty_usage_units),
      });
  }

  const [dailyUsage, unlinkedSpendShare] = await Promise.all([
    loadDailyUsage(supabase, businessUnit, firstDate, matById),
    loadUnlinkedSpendShare(supabase, businessUnit, firstDate),
  ]);
  return computeLeakage({
    materials,
    counts,
    receipts,
    dailyUsage,
    fromDate,
    today,
    unlinkedSpendShare,
  });
}

/** Porsi rupiah baris belanja berjenis "lain" (tidak tertaut ke bahan) sejak `sinceDate`. */
async function loadUnlinkedSpendShare(supabase: DB, businessUnit: string, sinceDate: string): Promise<number | null> {
  const purchases = await paged((from, to) =>
    supabase
      .from("procurement_purchases" as never)
      .select("id")
      .eq("business_unit", businessUnit)
      .gte("purchase_date", sinceDate)
      .order("id")
      .range(from, to)
  );
  const ids = purchases.map((p) => p.id as string);
  let total = 0;
  let unlinked = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const lines = await paged((from, to) =>
      supabase
        .from("procurement_purchase_lines" as never)
        .select("kind, total")
        .in("purchase_id", chunk)
        .order("id")
        .range(from, to)
    );
    for (const l of lines) {
      const t = num(l.total);
      total += t;
      if (l.kind === "lain") unlinked += t;
    }
  }
  return total > 0 ? unlinked / total : null;
}

async function loadDailyUsage(
  supabase: DB,
  businessUnit: string,
  sinceDate: string,
  matById: Map<string, Row>
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  const f = posAccountFilterForCostingBrand(businessUnit);
  let aq = supabase.from("bank_accounts").select("id").eq("business_unit", f.businessUnit).eq("bank", "cash");
  if (f.branch) aq = aq.eq("default_branch", f.branch);
  const { data: acct } = await aq.limit(1).maybeSingle();
  if (!acct) return out;

  const moves = await paged((from, to) =>
    supabase
      .from("pos_stock_movements" as never)
      .select("product_id, variant_id, qty, movement_date")
      .eq("bank_account_id", acct.id)
      .eq("type", "production")
      .gte("movement_date", sinceDate)
      .gt("qty", 0)
      .lt("qty", MAX_PLAUSIBLE_PRODUCTION_QTY)
      .order("movement_date")
      .order("id")
      .range(from, to)
  );
  if (moves.length === 0) return out;

  const { data: prodRows } = await supabase
    .from("costing_products" as never)
    .select("id, pos_product_id, pos_variant_id, yield_qty, yield_unit")
    .eq("business_unit", businessUnit)
    .eq("is_active", true);
  const allProducts = (prodRows ?? []) as Row[];
  const productById = new Map(allProducts.map((p) => [p.id as string, p]));
  const sold = allProducts.filter((p) => p.pos_product_id);
  if (sold.length === 0) return out;

  // Resep produk yang dijual + resep produk sumber bahan setengah jadi yang dipakainya.
  const sourceIds = new Set<string>();
  for (const m of matById.values()) if (m.source_product_id) sourceIds.add(m.source_product_id as string);
  const recipeIds = [...new Set([...sold.map((p) => p.id as string), ...sourceIds])];
  const [{ data: itemRows }, units] = await Promise.all([
    supabase
      .from("costing_recipe_items" as never)
      .select("product_id, material_id, qty, unit")
      .in("product_id", recipeIds),
    fetchUnitsMap(supabase),
  ]);
  const itemsByProduct = new Map<string, Row[]>();
  for (const it of (itemRows ?? []) as Row[]) {
    const k = it.product_id as string;
    const arr = itemsByProduct.get(k) ?? [];
    arr.push(it);
    itemsByProduct.set(k, arr);
  }

  /** Jumlah bahan per 1 unit hasil resep, dalam satuan pakai bahan; null bila satuannya tak bisa dikonversi. */
  const perUnit = (it: Row, yieldQty: number, usageUnit: string): number | null => {
    let v = num(it.qty) / yieldQty;
    const ru = it.unit as string | null;
    if (ru && ru !== usageUnit) {
      const a = units.get(ru);
      const b = units.get(usageUnit);
      if (!a || !b || a.dimension !== b.dimension) return null; // tak bisa dikonversi: jangan menebak
      v = (v * a.to_base) / b.to_base;
    }
    return v;
  };
  const add = (materialId: string, date: string, qty: number) => {
    const m = matById.get(materialId);
    if (!m || m.source_product_id) return;
    const withShrink = qty * (1 + Math.max(0, num(m.shrink_factor)));
    const byDate = out.get(materialId) ?? new Map<string, number>();
    byDate.set(date, (byDate.get(date) ?? 0) + withShrink);
    out.set(materialId, byDate);
  };

  for (const p of sold) {
    const yieldQty = num(p.yield_qty);
    if (!(yieldQty > 0)) continue;
    const made = new Map<string, number>();
    for (const mv of moves) {
      if (mv.product_id !== p.pos_product_id) continue;
      if (p.pos_variant_id && mv.variant_id !== p.pos_variant_id) continue;
      const d = mv.movement_date as string;
      made.set(d, (made.get(d) ?? 0) + num(mv.qty));
    }
    if (made.size === 0) continue;
    for (const it of itemsByProduct.get(p.id as string) ?? []) {
      const m = matById.get(it.material_id as string);
      if (!m) continue;
      const per = perUnit(it, yieldQty, m.usage_unit as string);
      if (per == null) continue;
      for (const [d, q] of made) {
        const qty = q * per;
        if (!m.source_product_id) {
          add(m.id as string, d, qty);
          continue;
        }
        // Bahan setengah jadi: urai satu tingkat ke bahan bakunya. Hanya bila satuan hasil resep sumber = satuan pakai.
        const src = productById.get(m.source_product_id as string);
        const srcYield = src ? num(src.yield_qty) : 0;
        if (!src || !(srcYield > 0) || src.yield_unit !== m.usage_unit) continue;
        for (const sub of itemsByProduct.get(src.id as string) ?? []) {
          const sm = matById.get(sub.material_id as string);
          if (!sm) continue;
          const sp = perUnit(sub, srcYield, sm.usage_unit as string);
          if (sp != null) add(sm.id as string, d, qty * sp);
        }
      }
    }
  }
  return out;
}
