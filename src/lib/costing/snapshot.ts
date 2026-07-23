/**
 * Capture snapshot HPP semua produk (per brand) untuk hari ini (WIB).
 *
 * Dipakai DUA jalur: server action `captureHppSnapshots` (di balik
 * requireAdmin, tombol manual) DAN cron (`checkCronAuth`). Karena cron
 * tak punya sesi user, logikanya di sini memakai service-role client
 * langsung TANPA gate — sama pola dgn lib cron lain (yeobo reminders).
 * BUKAN "use server".
 */

import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { jakartaDateString } from "@/lib/utils/jakarta";
import {
  computeHpp,
  type CostingMaterialLite,
  type LaborMode,
  type OverheadMethod,
  type PriceMethod,
  type ProductCostLite,
  type RoundingMode,
  type UnitDef,
} from "@/lib/costing/calc";

const num = (v: unknown): number =>
  typeof v === "number" ? v : Number(v ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

function toCostLite(p: Record<string, unknown>): ProductCostLite {
  return {
    yield_qty: num(p.yield_qty),
    labor: num(p.labor),
    labor_mode: (p.labor_mode as LaborMode) ?? "nominal",
    labor_rate: num(p.labor_rate),
    labor_hours: num(p.labor_hours),
    packaging: num(p.packaging),
    overhead_method: (p.overhead_method as OverheadMethod) ?? "persen",
    overhead_percent: num(p.overhead_percent),
    overhead_nominal: num(p.overhead_nominal),
    price_method: (p.price_method as PriceMethod) ?? "margin",
    target_percent: num(p.target_percent),
    rounding_unit: num(p.rounding_unit),
    rounding_mode: (p.rounding_mode as RoundingMode) ?? "nearest",
  };
}

export async function runHppSnapshotCapture(opts?: {
  businessUnit?: string;
  createdBy?: string | null;
}): Promise<{ count: number }> {
  const supabase = createAdminClient();

  let brands: string[];
  if (opts?.businessUnit) {
    brands = [opts.businessUnit];
  } else {
    const { data } = await supabase
      .from("costing_products" as never)
      .select("business_unit")
      .eq("is_active", true);
    brands = Array.from(
      new Set(
        ((data ?? []) as Record<string, unknown>[]).map(
          (r) => r.business_unit as string
        )
      )
    );
  }

  const { data: unitRows } = await supabase
    .from("costing_units" as never)
    .select("code, dimension, to_base");
  const unitsByCode = new Map<string, UnitDef>();
  for (const r of (unitRows ?? []) as Record<string, unknown>[])
    unitsByCode.set(r.code as string, {
      dimension: r.dimension as "mass" | "volume" | "count",
      to_base: num(r.to_base),
    });

  const today = jakartaDateString(new Date());
  let count = 0;

  for (const bu of brands) {
    const { data: prods } = await supabase
      .from("costing_products" as never)
      .select("*")
      .eq("business_unit", bu)
      .eq("is_active", true);
    const products = (prods ?? []) as Record<string, unknown>[];
    if (products.length === 0) continue;

    const { data: mats } = await supabase
      .from("costing_materials" as never)
      .select("*")
      .eq("business_unit", bu);
    const materialsById = new Map<string, CostingMaterialLite>();
    for (const m of (mats ?? []) as Record<string, unknown>[])
      materialsById.set(m.id as string, {
        id: m.id as string,
        name: m.name as string,
        purchase_price: num(m.purchase_price),
        content_per_purchase: num(m.content_per_purchase),
        usage_unit: m.usage_unit as string,
      });

    const ids = products.map((p) => p.id as string);
    const { data: itemRows } = await supabase
      .from("costing_recipe_items" as never)
      .select("product_id, material_id, qty, shrink_factor, unit")
      .in("product_id", ids);
    const itemsByProduct = new Map<
      string,
      { material_id: string; qty: number; shrink_factor: number; unit: string | null }[]
    >();
    for (const r of (itemRows ?? []) as Record<string, unknown>[]) {
      const pid = r.product_id as string;
      const arr = itemsByProduct.get(pid) ?? [];
      arr.push({
        material_id: r.material_id as string,
        qty: num(r.qty),
        shrink_factor: num(r.shrink_factor),
        unit: (r.unit as string | null) ?? null,
      });
      itemsByProduct.set(pid, arr);
    }

    const snapshots = products.map((p) => {
      const b = computeHpp(
        itemsByProduct.get(p.id as string) ?? [],
        toCostLite(p),
        materialsById,
        unitsByCode
      );
      return {
        product_id: p.id as string,
        business_unit: bu,
        snapshot_date: today,
        hpp_unit: round2(b.hppUnit),
        final_price: b.finalPrice != null ? round2(b.finalPrice) : null,
        margin_percent: b.marginPercent,
        breakdown_json: b,
        created_by: opts?.createdBy ?? null,
      };
    });

    const { error } = await supabase
      .from("costing_hpp_snapshot" as never)
      .upsert(snapshots as never, { onConflict: "product_id,snapshot_date" });
    if (!error) count += snapshots.length;
  }

  return { count };
}
