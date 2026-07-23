"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { runHppSnapshotCapture } from "@/lib/costing/snapshot";
import {
  computeHpp,
  type CostingMaterialLite,
  type HppBreakdown,
  type LaborMode,
  type OverheadMethod,
  type PriceMethod,
  type RoundingMode,
  type UnitDef,
} from "@/lib/costing/calc";

/**
 * Server actions modul Costing / HPP. RLS costing = admin-only, tapi
 * writes tetap lewat service-role `adminClient()` di balik
 * `requireAdmin()` — pola sama dgn cake-options.actions.ts. Tabel belum
 * ada di generated types, jadi pakai cast `.from("..." as never)` +
 * koersi kolom `numeric` (datang sebagai string dari PostgREST) ke Number.
 */

// ── Row types (dikonsumsi UI) ──────────────────────────────────────────
export interface CostingMaterial {
  id: string;
  business_unit: string;
  name: string;
  category: string | null;
  purchase_unit: string;
  purchase_price: number;
  content_per_purchase: number;
  usage_unit: string;
  price_updated_at: string;
  is_active: boolean;
}

export interface CostingRecipeItem {
  id: string;
  product_id: string;
  material_id: string;
  qty: number;
  shrink_factor: number;
  sort_order: number;
  /** Satuan qty resep; null = pakai satuan pakai bahan. */
  unit: string | null;
}

export interface CostingUnit {
  code: string;
  label: string;
  dimension: "mass" | "volume" | "count";
  to_base: number;
}

export interface CostingProduct {
  id: string;
  business_unit: string;
  name: string;
  category: string | null;
  type: "resep" | "paket_jasa";
  yield_qty: number;
  yield_unit: string | null;
  labor: number;
  labor_mode: LaborMode;
  labor_rate: number;
  labor_hours: number;
  packaging: number;
  overhead_method: OverheadMethod;
  overhead_percent: number;
  overhead_nominal: number;
  price_method: PriceMethod;
  target_percent: number;
  rounding_unit: number;
  rounding_mode: RoundingMode;
  is_active: boolean;
}

export interface MaterialPriceHistoryRow {
  id: string;
  purchase_price: number;
  content_per_purchase: number;
  effective_from: string;
}

/** Produk + resep + breakdown HPP siap tampil. */
export interface CostingProductWithHpp {
  product: CostingProduct;
  items: CostingRecipeItem[];
  breakdown: HppBreakdown;
}

// ── Koersi baris mentah (numeric → number) ─────────────────────────────
function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

function mapMaterial(r: Record<string, unknown>): CostingMaterial {
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

function mapItem(r: Record<string, unknown>): CostingRecipeItem {
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

/** Semua satuan konversi. Digunakan client (picker) & server (hitung). */
export async function listUnits(): Promise<ActionResult<CostingUnit[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("costing_units" as never)
    .select("*")
    .order("dimension", { ascending: true })
    .order("to_base", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      code: r.code as string,
      label: r.label as string,
      dimension: r.dimension as "mass" | "volume" | "count",
      to_base: num(r.to_base),
    })),
  };
}

async function fetchUnitsMap(
  supabase: ReturnType<typeof adminClient>
): Promise<Map<string, UnitDef>> {
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

function mapProduct(r: Record<string, unknown>): CostingProduct {
  return {
    id: r.id as string,
    business_unit: r.business_unit as string,
    name: r.name as string,
    category: (r.category as string | null) ?? null,
    type: r.type as "resep" | "paket_jasa",
    yield_qty: num(r.yield_qty),
    yield_unit: (r.yield_unit as string | null) ?? null,
    labor: num(r.labor),
    labor_mode: (r.labor_mode as LaborMode) ?? "nominal",
    labor_rate: num(r.labor_rate),
    labor_hours: num(r.labor_hours),
    packaging: num(r.packaging),
    overhead_method: r.overhead_method as OverheadMethod,
    overhead_percent: num(r.overhead_percent),
    overhead_nominal: num(r.overhead_nominal),
    price_method: r.price_method as PriceMethod,
    target_percent: num(r.target_percent),
    rounding_unit: num(r.rounding_unit),
    rounding_mode: r.rounding_mode as RoundingMode,
    is_active: r.is_active as boolean,
  };
}

function toLite(m: CostingMaterial): CostingMaterialLite {
  return {
    id: m.id,
    name: m.name,
    purchase_price: m.purchase_price,
    content_per_purchase: m.content_per_purchase,
    usage_unit: m.usage_unit,
  };
}

function breakdownFor(
  product: CostingProduct,
  items: CostingRecipeItem[],
  materialsById: Map<string, CostingMaterialLite>,
  unitsByCode?: Map<string, UnitDef>
): HppBreakdown {
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

// ═══════════════════════════════ Bahan ═══════════════════════════════

export async function listMaterials(
  businessUnit?: string
): Promise<ActionResult<CostingMaterial[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  let q = supabase
    .from("costing_materials" as never)
    .select("*")
    .order("name", { ascending: true });
  if (businessUnit) q = q.eq("business_unit", businessUnit);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: ((data ?? []) as Record<string, unknown>[]).map(mapMaterial),
  };
}

export interface MaterialInput {
  business_unit: string;
  name: string;
  category: string | null;
  purchase_unit: string;
  purchase_price: number;
  content_per_purchase: number;
  usage_unit: string;
}

export async function createMaterial(
  input: MaterialInput
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.name.trim()) return { ok: false, error: "Nama bahan wajib diisi" };
  if (!input.business_unit) return { ok: false, error: "Brand wajib dipilih" };
  if (!(input.content_per_purchase > 0))
    return { ok: false, error: "Isi per satuan beli harus > 0" };
  if (!Number.isFinite(input.purchase_price) || input.purchase_price < 0)
    return { ok: false, error: "Harga beli tidak valid" };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("costing_materials" as never)
    .insert({
      business_unit: input.business_unit,
      name: input.name.trim(),
      category: input.category?.trim() || null,
      purchase_unit: input.purchase_unit.trim() || "unit",
      purchase_price: Math.round(input.purchase_price * 100) / 100,
      content_per_purchase: input.content_per_purchase,
      usage_unit: input.usage_unit.trim() || "unit",
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal" };
  revalidatePath("/admin/costing", "layout");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateMaterial(input: {
  id: string;
  name?: string;
  category?: string | null;
  purchase_unit?: string;
  purchase_price?: number;
  content_per_purchase?: number;
  usage_unit?: string;
  is_active?: boolean;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  // Baca kondisi lama untuk (a) validasi dan (b) deteksi perubahan harga.
  const { data: prevRow, error: prevErr } = await supabase
    .from("costing_materials" as never)
    .select("purchase_price, content_per_purchase")
    .eq("id", input.id)
    .maybeSingle();
  if (prevErr) return { ok: false, error: prevErr.message };
  if (!prevRow) return { ok: false, error: "Bahan tidak ditemukan" };
  const prev = prevRow as { purchase_price: unknown; content_per_purchase: unknown };
  const prevPrice = num(prev.purchase_price);
  const prevContent = num(prev.content_per_purchase);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    if (!input.name.trim()) return { ok: false, error: "Nama tidak boleh kosong" };
    patch.name = input.name.trim();
  }
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (input.purchase_unit !== undefined)
    patch.purchase_unit = input.purchase_unit.trim() || "unit";
  if (input.usage_unit !== undefined)
    patch.usage_unit = input.usage_unit.trim() || "unit";
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const newPrice =
    input.purchase_price !== undefined ? input.purchase_price : prevPrice;
  const newContent =
    input.content_per_purchase !== undefined
      ? input.content_per_purchase
      : prevContent;
  if (input.purchase_price !== undefined) {
    if (input.purchase_price < 0)
      return { ok: false, error: "Harga beli tidak valid" };
    patch.purchase_price = Math.round(input.purchase_price * 100) / 100;
  }
  if (input.content_per_purchase !== undefined) {
    if (!(input.content_per_purchase > 0))
      return { ok: false, error: "Isi per satuan beli harus > 0" };
    patch.content_per_purchase = input.content_per_purchase;
  }

  // Harga/isi berubah → catat riwayat + stempel price_updated_at. Ini
  // yang membuat "produk terdampak" & repricing terlacak. Bandingkan pada
  // nilai TERBULAT (yang benar-benar disimpan) supaya edit sub-sen yang
  // tak mengubah apa pun tidak menghasilkan baris riwayat palsu.
  const roundPrice = (n: number) => Math.round(n * 100) / 100;
  const priceChanged =
    roundPrice(newPrice) !== roundPrice(prevPrice) ||
    newContent !== prevContent;
  if (priceChanged) patch.price_updated_at = new Date().toISOString();

  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await supabase
    .from("costing_materials" as never)
    .update(patch as never)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  if (priceChanged) {
    // Best-effort log; kegagalan log tak boleh membatalkan update harga.
    await supabase.from("costing_material_price_history" as never).insert({
      material_id: input.id,
      purchase_price: Math.round(newPrice * 100) / 100,
      content_per_purchase: newContent,
      created_by: gate.userId,
    } as never);
  }
  revalidatePath("/admin/costing", "layout");
  return { ok: true };
}

export async function deleteMaterial(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  // Dipakai resep? → soft-delete (jaga integritas HPP historis). Belum? →
  // hard delete. FK recipe_items.material_id ON DELETE RESTRICT mencegah
  // hard delete tak sengaja.
  const { count } = await supabase
    .from("costing_recipe_items" as never)
    .select("id", { count: "exact", head: true })
    .eq("material_id", id);
  const softDelete = async () => {
    const { error } = await supabase
      .from("costing_materials" as never)
      .update({ is_active: false } as never)
      .eq("id", id);
    return error;
  };
  if ((count ?? 0) > 0) {
    const error = await softDelete();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/costing", "layout");
    return { ok: true };
  }
  const { error } = await supabase
    .from("costing_materials" as never)
    .delete()
    .eq("id", id);
  if (error) {
    // TOCTOU: baris resep bisa muncul di antara cek & delete → FK RESTRICT
    // menolak. Jangan bocorkan pesan driver mentah — jatuh ke soft-delete.
    const softErr = await softDelete();
    if (softErr) return { ok: false, error: softErr.message };
    revalidatePath("/admin/costing", "layout");
    return { ok: true };
  }
  revalidatePath("/admin/costing", "layout");
  return { ok: true };
}

export async function listMaterialPriceHistory(
  materialId: string
): Promise<ActionResult<MaterialPriceHistoryRow[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("costing_material_price_history" as never)
    .select("id, purchase_price, content_per_purchase, effective_from")
    .eq("material_id", materialId)
    .order("effective_from", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      purchase_price: num(r.purchase_price),
      content_per_purchase: num(r.content_per_purchase),
      effective_from: r.effective_from as string,
    })),
  };
}

// ═══════════════════════════════ Produk ══════════════════════════════

/** Daftar produk brand + HPP terhitung (server-side, satu sumber calc). */
export async function listProductsWithHpp(
  businessUnit?: string
): Promise<ActionResult<CostingProductWithHpp[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  let pq = supabase
    .from("costing_products" as never)
    .select("*")
    .order("name", { ascending: true });
  if (businessUnit) pq = pq.eq("business_unit", businessUnit);
  const [{ data: prodRows, error: pErr }, matsRes, unitsByCode] =
    await Promise.all([pq, listMaterials(businessUnit), fetchUnitsMap(supabase)]);
  if (pErr) return { ok: false, error: pErr.message };
  if (!matsRes.ok) return matsRes;
  const products = ((prodRows ?? []) as Record<string, unknown>[]).map(mapProduct);
  const materialsById = new Map(
    (matsRes.data ?? []).map((m) => [m.id, toLite(m)])
  );

  const productIds = products.map((p) => p.id);
  const itemsByProduct = new Map<string, CostingRecipeItem[]>();
  if (productIds.length > 0) {
    const { data: itemRows, error: iErr } = await supabase
      .from("costing_recipe_items" as never)
      .select("*")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true });
    if (iErr) return { ok: false, error: iErr.message };
    for (const r of (itemRows ?? []) as Record<string, unknown>[]) {
      const it = mapItem(r);
      const arr = itemsByProduct.get(it.product_id) ?? [];
      arr.push(it);
      itemsByProduct.set(it.product_id, arr);
    }
  }

  return {
    ok: true,
    data: products.map((product) => {
      const items = itemsByProduct.get(product.id) ?? [];
      return {
        product,
        items,
        breakdown: breakdownFor(product, items, materialsById, unitsByCode),
      };
    }),
  };
}

export async function getProduct(
  id: string
): Promise<ActionResult<{ product: CostingProduct; items: CostingRecipeItem[] }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data: prodRow, error: pErr } = await supabase
    .from("costing_products" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!prodRow) return { ok: false, error: "Produk tidak ditemukan" };
  const { data: itemRows, error: iErr } = await supabase
    .from("costing_recipe_items" as never)
    .select("*")
    .eq("product_id", id)
    .order("sort_order", { ascending: true });
  if (iErr) return { ok: false, error: iErr.message };
  return {
    ok: true,
    data: {
      product: mapProduct(prodRow as Record<string, unknown>),
      items: ((itemRows ?? []) as Record<string, unknown>[]).map(mapItem),
    },
  };
}

export async function createProduct(input: {
  business_unit: string;
  name: string;
  category?: string | null;
  yield_qty?: number;
  yield_unit?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.name.trim()) return { ok: false, error: "Nama produk wajib diisi" };
  if (!input.business_unit) return { ok: false, error: "Brand wajib dipilih" };
  const yieldQty = input.yield_qty ?? 1;
  if (!(yieldQty > 0)) return { ok: false, error: "Yield harus > 0" };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("costing_products" as never)
    .insert({
      business_unit: input.business_unit,
      name: input.name.trim(),
      category: input.category?.trim() || null,
      yield_qty: yieldQty,
      yield_unit: input.yield_unit?.trim() || null,
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal" };
  revalidatePath("/admin/costing", "layout");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateProduct(input: {
  id: string;
  name?: string;
  category?: string | null;
  yield_qty?: number;
  yield_unit?: string | null;
  labor?: number;
  labor_mode?: LaborMode;
  labor_rate?: number;
  labor_hours?: number;
  packaging?: number;
  overhead_method?: OverheadMethod;
  overhead_percent?: number;
  overhead_nominal?: number;
  price_method?: PriceMethod;
  target_percent?: number;
  rounding_unit?: number;
  rounding_mode?: RoundingMode;
  is_active?: boolean;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const patch: Record<string, unknown> = {};
  const setNum = (key: string, v: number | undefined, min = 0) => {
    if (v === undefined) return null;
    if (!Number.isFinite(v) || v < min) return "invalid";
    patch[key] = v;
    return "ok";
  };
  if (input.name !== undefined) {
    if (!input.name.trim()) return { ok: false, error: "Nama tidak boleh kosong" };
    patch.name = input.name.trim();
  }
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (input.yield_unit !== undefined) patch.yield_unit = input.yield_unit?.trim() || null;
  if (input.yield_qty !== undefined) {
    if (!(input.yield_qty > 0)) return { ok: false, error: "Yield harus > 0" };
    patch.yield_qty = input.yield_qty;
  }
  if (setNum("labor", input.labor) === "invalid")
    return { ok: false, error: "TKL tidak valid" };
  if (setNum("labor_rate", input.labor_rate) === "invalid")
    return { ok: false, error: "Tarif TKL tidak valid" };
  if (setNum("labor_hours", input.labor_hours) === "invalid")
    return { ok: false, error: "Jam TKL tidak valid" };
  if (input.labor_mode !== undefined) patch.labor_mode = input.labor_mode;
  if (setNum("packaging", input.packaging) === "invalid")
    return { ok: false, error: "Kemasan tidak valid" };
  if (setNum("overhead_percent", input.overhead_percent) === "invalid")
    return { ok: false, error: "Overhead % tidak valid" };
  if (setNum("overhead_nominal", input.overhead_nominal) === "invalid")
    return { ok: false, error: "Overhead nominal tidak valid" };
  if (setNum("target_percent", input.target_percent) === "invalid")
    return { ok: false, error: "Target % tidak valid" };
  if (input.overhead_method !== undefined)
    patch.overhead_method = input.overhead_method;
  if (input.price_method !== undefined) patch.price_method = input.price_method;
  if (input.rounding_mode !== undefined) patch.rounding_mode = input.rounding_mode;
  if (input.rounding_unit !== undefined) {
    if (!(input.rounding_unit >= 1))
      return { ok: false, error: "Pembulatan harus ≥ 1" };
    patch.rounding_unit = Math.round(input.rounding_unit);
  }
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (Object.keys(patch).length === 0) return { ok: true };

  const supabase = adminClient();
  const { error } = await supabase
    .from("costing_products" as never)
    .update(patch as never)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/costing", "layout");
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  // recipe_items ikut terhapus (FK ON DELETE CASCADE).
  const { error } = await supabase
    .from("costing_products" as never)
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/costing", "layout");
  return { ok: true };
}

/** Deep-copy produk + resepnya (pola duplicateChecklist). */
export async function duplicateProduct(
  id: string
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data: srcRow, error: sErr } = await supabase
    .from("costing_products" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (sErr) return { ok: false, error: sErr.message };
  if (!srcRow) return { ok: false, error: "Produk tidak ditemukan" };
  const src = mapProduct(srcRow as Record<string, unknown>);

  const { data: newRow, error: iErr } = await supabase
    .from("costing_products" as never)
    .insert({
      business_unit: src.business_unit,
      name: `${src.name} (salinan)`,
      category: src.category,
      type: src.type,
      yield_qty: src.yield_qty,
      yield_unit: src.yield_unit,
      labor: src.labor,
      labor_mode: src.labor_mode,
      labor_rate: src.labor_rate,
      labor_hours: src.labor_hours,
      packaging: src.packaging,
      overhead_method: src.overhead_method,
      overhead_percent: src.overhead_percent,
      overhead_nominal: src.overhead_nominal,
      price_method: src.price_method,
      target_percent: src.target_percent,
      rounding_unit: src.rounding_unit,
      rounding_mode: src.rounding_mode,
      is_active: src.is_active,
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (iErr || !newRow) return { ok: false, error: iErr?.message ?? "Gagal" };
  const newId = (newRow as { id: string }).id;

  const { data: items, error: itErr } = await supabase
    .from("costing_recipe_items" as never)
    .select("material_id, qty, shrink_factor, sort_order, unit")
    .eq("product_id", id)
    .order("sort_order", { ascending: true });
  if (itErr) return { ok: false, error: itErr.message };
  const rows = (items ?? []) as Record<string, unknown>[];
  if (rows.length > 0) {
    const { error: insErr } = await supabase
      .from("costing_recipe_items" as never)
      .insert(
        rows.map((r) => ({
          product_id: newId,
          material_id: r.material_id,
          qty: r.qty,
          shrink_factor: r.shrink_factor,
          sort_order: r.sort_order,
          unit: r.unit,
        })) as never
      );
    if (insErr) return { ok: false, error: insErr.message };
  }
  revalidatePath("/admin/costing", "layout");
  return { ok: true, data: { id: newId } };
}

// ════════════════════════════ Baris resep ════════════════════════════

export async function addRecipeItem(input: {
  product_id: string;
  material_id: string;
  qty?: number;
  shrink_factor?: number;
  unit?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data: maxRow } = await supabase
    .from("costing_recipe_items" as never)
    .select("sort_order")
    .eq("product_id", input.product_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    (maxRow ? num((maxRow as { sort_order: unknown }).sort_order) : -1) + 1;
  const { data, error } = await supabase
    .from("costing_recipe_items" as never)
    .insert({
      product_id: input.product_id,
      material_id: input.material_id,
      qty: input.qty ?? 0,
      shrink_factor: input.shrink_factor ?? 0,
      sort_order: nextOrder,
      unit: input.unit ?? null,
    } as never)
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal" };
  revalidatePath("/admin/costing", "layout");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateRecipeItem(input: {
  id: string;
  qty?: number;
  shrink_factor?: number;
  /** Ganti bahan pada baris — divalidasi harus se-brand dgn produknya. */
  material_id?: string;
  /** Satuan qty resep; null = satuan pakai bahan. */
  unit?: string | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const patch: Record<string, unknown> = {};
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.qty !== undefined) {
    if (!Number.isFinite(input.qty) || input.qty < 0)
      return { ok: false, error: "Qty tidak valid" };
    patch.qty = input.qty;
  }
  if (input.shrink_factor !== undefined) {
    if (!Number.isFinite(input.shrink_factor) || input.shrink_factor < 0)
      return { ok: false, error: "Faktor susut tidak valid" };
    patch.shrink_factor = input.shrink_factor;
  }
  const supabase = adminClient();
  if (input.material_id !== undefined) {
    // Cegah ganti ke bahan brand lain: bandingkan business_unit produk
    // (via recipe item) dengan business_unit bahan target.
    const { data: joined } = await supabase
      .from("costing_recipe_items" as never)
      .select("product:costing_products!inner(business_unit)")
      .eq("id", input.id)
      .maybeSingle();
    const prodBu = (
      joined as { product?: { business_unit?: string } } | null
    )?.product?.business_unit;
    const { data: mat } = await supabase
      .from("costing_materials" as never)
      .select("business_unit")
      .eq("id", input.material_id)
      .maybeSingle();
    const matBu = (mat as { business_unit?: string } | null)?.business_unit;
    if (!matBu) return { ok: false, error: "Bahan tidak ditemukan" };
    if (prodBu && matBu !== prodBu)
      return { ok: false, error: "Bahan bukan milik brand produk ini" };
    patch.material_id = input.material_id;
  }
  if (Object.keys(patch).length === 0) return { ok: true };
  const { error } = await supabase
    .from("costing_recipe_items" as never)
    .update(patch as never)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/costing", "layout");
  return { ok: true };
}

export async function deleteRecipeItem(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { error } = await supabase
    .from("costing_recipe_items" as never)
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/costing", "layout");
  return { ok: true };
}

export async function reorderRecipeItems(
  orderedIds: string[]
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase
        .from("costing_recipe_items" as never)
        .update({ sort_order: idx } as never)
        .eq("id", id)
    )
  );
  revalidatePath("/admin/costing", "layout");
  return { ok: true };
}

// ═══════════════════════ Slice: produk terdampak ═════════════════════

/**
 * Produk yang memakai suatu bahan, beserta breakdown HPP-nya SEKARANG.
 * Klien bisa hitung ulang dengan harga baru (via calc.ts) untuk pratinjau
 * dampak sebelum menyimpan.
 */
export async function listProductsUsingMaterial(
  materialId: string
): Promise<ActionResult<CostingProductWithHpp[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  const { data: refRows, error: rErr } = await supabase
    .from("costing_recipe_items" as never)
    .select("product_id")
    .eq("material_id", materialId);
  if (rErr) return { ok: false, error: rErr.message };
  const productIds = Array.from(
    new Set(
      ((refRows ?? []) as Record<string, unknown>[]).map(
        (r) => r.product_id as string
      )
    )
  );
  if (productIds.length === 0) return { ok: true, data: [] };

  const { data: prodRows, error: pErr } = await supabase
    .from("costing_products" as never)
    .select("*")
    .in("id", productIds);
  if (pErr) return { ok: false, error: pErr.message };
  const products = ((prodRows ?? []) as Record<string, unknown>[]).map(mapProduct);

  const { data: itemRows, error: iErr } = await supabase
    .from("costing_recipe_items" as never)
    .select("*")
    .in("product_id", productIds)
    .order("sort_order", { ascending: true });
  if (iErr) return { ok: false, error: iErr.message };
  const items = ((itemRows ?? []) as Record<string, unknown>[]).map(mapItem);
  const itemsByProduct = new Map<string, CostingRecipeItem[]>();
  for (const it of items) {
    const arr = itemsByProduct.get(it.product_id) ?? [];
    arr.push(it);
    itemsByProduct.set(it.product_id, arr);
  }

  // Bahan yang dibutuhkan semua produk terdampak (untuk hitung HPP).
  const materialIds = Array.from(new Set(items.map((it) => it.material_id)));
  const { data: matRows, error: mErr } = await supabase
    .from("costing_materials" as never)
    .select("*")
    .in("id", materialIds);
  if (mErr) return { ok: false, error: mErr.message };
  const materialsById = new Map(
    ((matRows ?? []) as Record<string, unknown>[]).map((r) => {
      const m = mapMaterial(r);
      return [m.id, toLite(m)];
    })
  );
  const unitsByCode = await fetchUnitsMap(supabase);

  return {
    ok: true,
    data: products
      .map((product) => {
        const its = itemsByProduct.get(product.id) ?? [];
        return {
          product,
          items: its,
          breakdown: breakdownFor(product, its, materialsById, unitsByCode),
        };
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name)),
  };
}

// ═══════════════════════ Snapshot HPP (tren B2) ══════════════════════

export interface CostingSnapshot {
  snapshot_date: string;
  hpp_unit: number;
  final_price: number | null;
  margin_percent: number | null;
}

/** Tombol manual "Ambil snapshot" — capture HPP hari ini utk 1 brand
 *  (atau semua bila tak diisi). */
export async function captureHppSnapshots(
  businessUnit?: string
): Promise<ActionResult<{ count: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const { count } = await runHppSnapshotCapture({
      businessUnit,
      createdBy: gate.userId,
    });
    revalidatePath("/admin/costing", "layout");
    return { ok: true, data: { count } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal" };
  }
}

/** Tren snapshot satu produk (lama → baru) untuk sparkline. */
export async function listHppSnapshots(
  productId: string
): Promise<ActionResult<CostingSnapshot[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("costing_hpp_snapshot" as never)
    .select("snapshot_date, hpp_unit, final_price, margin_percent")
    .eq("product_id", productId)
    .order("snapshot_date", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      snapshot_date: r.snapshot_date as string,
      hpp_unit: num(r.hpp_unit),
      final_price: r.final_price != null ? num(r.final_price) : null,
      margin_percent: r.margin_percent != null ? num(r.margin_percent) : null,
    })),
  };
}
