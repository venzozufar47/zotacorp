"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { runHppSnapshotCapture } from "@/lib/costing/snapshot";
import { updatePosProduct, updatePosProductVariant } from "./pos.actions";
import {
  num,
  mapMaterial,
  mapProduct,
  mapItem,
  breakdownFor,
  loadBrandCosting,
  computeAll,
} from "@/lib/costing/rows";
import {
  type HppBreakdown,
  type LaborMode,
  type OverheadMethod,
  type PriceMethod,
  type RoundingMode,
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
  /** Faktor susut/waste bahan (fraksi). Berlaku di semua resep. */
  shrink_factor: number;
  price_updated_at: string;
  is_active: boolean;
}

export interface CostingRecipeItem {
  id: string;
  product_id: string;
  material_id: string;
  qty: number;
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
  crew_fee: number;
  transport: number;
  depreciation_per_event: number;
  price_method: PriceMethod;
  target_percent: number;
  /** Harga jual manual (rupiah) — dipakai saat price_method='manual'. */
  manual_price: number;
  rounding_unit: number;
  rounding_mode: RoundingMode;
  is_active: boolean;
  /** Tautan ke produk/varian POS (C2). Null = belum ditautkan. */
  pos_product_id: string | null;
  pos_variant_id: string | null;
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
  /** Faktor susut (fraksi, 0 = tanpa susut). Opsional; default 0. */
  shrink_factor?: number;
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
  const shrink = input.shrink_factor ?? 0;
  if (!Number.isFinite(shrink) || shrink < 0)
    return { ok: false, error: "Faktor susut tidak valid" };
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
      shrink_factor: shrink,
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
  shrink_factor?: number;
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
  if (input.shrink_factor !== undefined) {
    if (!Number.isFinite(input.shrink_factor) || input.shrink_factor < 0)
      return { ok: false, error: "Faktor susut tidak valid" };
    patch.shrink_factor = input.shrink_factor;
  }
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

export async function deleteMaterial(
  id: string
): Promise<ActionResult<{ softDeleted: boolean }>> {
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
    return { ok: true, data: { softDeleted: true } };
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
    return { ok: true, data: { softDeleted: true } };
  }
  revalidatePath("/admin/costing", "layout");
  return { ok: true, data: { softDeleted: false } };
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
  // Semua pemanggil menyediakan brand; tanpa brand → kosong.
  if (!businessUnit) return { ok: true, data: [] };
  const loaded = await loadBrandCosting(adminClient(), { businessUnit });
  return { ok: true, data: computeAll(loaded) };
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
  type?: "resep" | "paket_jasa";
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
      type: input.type === "paket_jasa" ? "paket_jasa" : "resep",
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
  crew_fee?: number;
  transport?: number;
  depreciation_per_event?: number;
  price_method?: PriceMethod;
  target_percent?: number;
  manual_price?: number;
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
  if (setNum("crew_fee", input.crew_fee) === "invalid")
    return { ok: false, error: "Fee crew tidak valid" };
  if (setNum("transport", input.transport) === "invalid")
    return { ok: false, error: "Transport tidak valid" };
  if (setNum("depreciation_per_event", input.depreciation_per_event) === "invalid")
    return { ok: false, error: "Depresiasi tidak valid" };
  if (setNum("target_percent", input.target_percent) === "invalid")
    return { ok: false, error: "Target % tidak valid" };
  if (setNum("manual_price", input.manual_price) === "invalid")
    return { ok: false, error: "Harga manual tidak valid" };
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
      crew_fee: src.crew_fee,
      transport: src.transport,
      depreciation_per_event: src.depreciation_per_event,
      price_method: src.price_method,
      target_percent: src.target_percent,
      manual_price: src.manual_price,
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
    .select("material_id, qty, sort_order, unit")
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
  unit?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  // Cegah bahan brand lain masuk ke resep — kalau tidak, HPP di daftar/
  // snapshot (materials di-scope per brand → 0) beda dgn panel dampak.
  // Guard + max-sort-order semuanya independen → satu Promise.all.
  const [{ data: prodRow }, { data: matRow }, { data: maxRow }] =
    await Promise.all([
      supabase
        .from("costing_products" as never)
        .select("business_unit")
        .eq("id", input.product_id)
        .maybeSingle(),
      supabase
        .from("costing_materials" as never)
        .select("business_unit")
        .eq("id", input.material_id)
        .maybeSingle(),
      supabase
        .from("costing_recipe_items" as never)
        .select("sort_order")
        .eq("product_id", input.product_id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  const prodBu = (prodRow as { business_unit?: string } | null)?.business_unit;
  const matBu = (matRow as { business_unit?: string } | null)?.business_unit;
  if (!prodBu) return { ok: false, error: "Produk tidak ditemukan" };
  if (!matBu) return { ok: false, error: "Bahan tidak ditemukan" };
  if (matBu !== prodBu)
    return { ok: false, error: "Bahan bukan milik brand produk ini" };
  const nextOrder =
    (maxRow ? num((maxRow as { sort_order: unknown }).sort_order) : -1) + 1;
  const { data, error } = await supabase
    .from("costing_recipe_items" as never)
    .insert({
      product_id: input.product_id,
      material_id: input.material_id,
      qty: input.qty ?? 0,
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
  const supabase = adminClient();
  if (input.material_id !== undefined) {
    // Cegah ganti ke bahan brand lain: bandingkan business_unit produk
    // (via recipe item) dengan business_unit bahan target.
    const [{ data: joined }, { data: mat }] = await Promise.all([
      supabase
        .from("costing_recipe_items" as never)
        .select("product:costing_products!inner(business_unit)")
        .eq("id", input.id)
        .maybeSingle(),
      supabase
        .from("costing_materials" as never)
        .select("business_unit")
        .eq("id", input.material_id)
        .maybeSingle(),
    ]);
    const prodBu = (
      joined as { product?: { business_unit?: string } } | null
    )?.product?.business_unit;
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

  // Bahan brand-scoped + resep se-brand (invariant dijaga) → semua produk
  // yang memakainya berada di brand yang sama. Muat brand itu, filter.
  const { data: matRow } = await supabase
    .from("costing_materials" as never)
    .select("business_unit")
    .eq("id", materialId)
    .maybeSingle();
  const bu = (matRow as { business_unit?: string } | null)?.business_unit;
  if (!bu) return { ok: true, data: [] };

  const loaded = await loadBrandCosting(supabase, { businessUnit: bu });
  const rows = computeAll(loaded)
    .filter((r) => r.items.some((it) => it.material_id === materialId))
    .sort((a, b) => a.product.name.localeCompare(b.product.name));
  return { ok: true, data: rows };
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

/** Ambang "HPP naik signifikan" bulan ini (vs snapshot terakhir). */
const HPP_RISE_THRESHOLD = 0.05;

export interface CostingDashboardRow {
  product: CostingProduct;
  breakdown: HppBreakdown;
  /** Kenaikan HPP vs snapshot terakhir (fraksi). null bila belum ada. */
  hppRosePct: number | null;
}
export interface CostingDashboard {
  rows: CostingDashboardRow[];
  avgMarginPercent: number | null;
  belowTargetCount: number;
  hppRoseCount: number;
}

/**
 * Data dashboard margin + repricing untuk satu brand: produk urut margin
 * TERENDAH, flag di bawah target, flag HPP naik >5% vs snapshot terakhir.
 */
export async function getCostingDashboard(
  businessUnit: string
): Promise<ActionResult<CostingDashboard>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  // Snapshot difilter by business_unit → bisa diambil PARALEL dgn daftar
  // produk (tak perlu tunggu ids). Snapshot terakhir per produk dipakai
  // deteksi kenaikan HPP.
  const [listRes, { data: snapRows }] = await Promise.all([
    listProductsWithHpp(businessUnit),
    supabase
      .from("costing_hpp_snapshot" as never)
      .select("product_id, hpp_unit, snapshot_date")
      .eq("business_unit", businessUnit)
      .order("snapshot_date", { ascending: false }),
  ]);
  if (!listRes.ok) return listRes;
  const list = listRes.data ?? [];

  const latestByProduct = new Map<string, number>();
  for (const r of (snapRows ?? []) as Record<string, unknown>[]) {
    const pid = r.product_id as string;
    if (!latestByProduct.has(pid)) latestByProduct.set(pid, num(r.hpp_unit));
  }

  const rows: CostingDashboardRow[] = list.map((r) => {
    const last = latestByProduct.get(r.product.id);
    const cur = r.breakdown.hppUnit;
    const hppRosePct =
      last != null && last > 0 ? (cur - last) / last : null;
    return { product: r.product, breakdown: r.breakdown, hppRosePct };
  });
  // Urut margin terendah dulu (null/invalid dianggap paling bawah).
  rows.sort((a, b) => {
    const ma = a.breakdown.marginPercent;
    const mb = b.breakdown.marginPercent;
    if (ma == null && mb == null) return 0;
    if (ma == null) return -1;
    if (mb == null) return 1;
    return ma - mb;
  });

  const valid = rows.filter((r) => r.breakdown.marginPercent != null);
  const avgMarginPercent =
    valid.length > 0
      ? valid.reduce((s, r) => s + (r.breakdown.marginPercent ?? 0), 0) /
        valid.length
      : null;
  const belowTargetCount = rows.filter(
    (r) =>
      r.breakdown.marginPercent != null &&
      r.product.price_method === "margin" &&
      r.breakdown.marginPercent < r.product.target_percent
  ).length;
  const hppRoseCount = rows.filter(
    (r) => r.hppRosePct != null && r.hppRosePct > HPP_RISE_THRESHOLD
  ).length;

  return {
    ok: true,
    data: { rows, avgMarginPercent, belowTargetCount, hppRoseCount },
  };
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

// ══════════════════════ Integrasi POS (C2) ═══════════════════════════

/** Satu opsi produk/varian POS yang bisa ditautkan. */
export interface PosLinkOption {
  pos_product_id: string;
  pos_variant_id: string | null;
  label: string;
  price: number;
}

/** Produk/varian POS untuk brand (via bank_accounts.business_unit).
 *  Dipakai picker "Tautkan ke POS". */
export async function listPosOptions(
  businessUnit: string
): Promise<ActionResult<PosLinkOption[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data: accts } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("business_unit", businessUnit);
  const acctIds = ((accts ?? []) as { id: string }[]).map((a) => a.id);
  if (acctIds.length === 0) return { ok: true, data: [] };

  const { data: prods } = await supabase
    .from("pos_products")
    .select("id, name, price")
    .in("bank_account_id", acctIds)
    .eq("active", true)
    .order("name", { ascending: true });
  const products = (prods ?? []) as { id: string; name: string; price: number | string }[];
  if (products.length === 0) return { ok: true, data: [] };

  const { data: vars } = await supabase
    .from("pos_product_variants")
    .select("id, product_id, name, price")
    .in(
      "product_id",
      products.map((p) => p.id)
    )
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const variantsByProduct = new Map<
    string,
    { id: string; name: string; price: number | string }[]
  >();
  for (const v of (vars ?? []) as {
    id: string;
    product_id: string;
    name: string;
    price: number | string;
  }[]) {
    const arr = variantsByProduct.get(v.product_id) ?? [];
    arr.push({ id: v.id, name: v.name, price: v.price });
    variantsByProduct.set(v.product_id, arr);
  }

  const options: PosLinkOption[] = [];
  for (const p of products) {
    const vs = variantsByProduct.get(p.id) ?? [];
    if (vs.length === 0) {
      options.push({
        pos_product_id: p.id,
        pos_variant_id: null,
        label: p.name,
        price: num(p.price),
      });
    } else {
      for (const v of vs)
        options.push({
          pos_product_id: p.id,
          pos_variant_id: v.id,
          label: `${p.name} — ${v.name}`,
          price: num(v.price),
        });
    }
  }
  return { ok: true, data: options };
}

/** Brand (business_unit) + apakah punya varian aktif, untuk produk POS. */
async function posProductInfo(
  supabase: ReturnType<typeof adminClient>,
  posProductId: string
): Promise<{ brand: string | null; hasVariants: boolean } | null> {
  const { data: p } = await supabase
    .from("pos_products")
    .select("bank_account_id")
    .eq("id", posProductId)
    .maybeSingle();
  if (!p) return null;
  // Brand-lookup & variant-count independen → paralel.
  const [{ data: ba }, { count }] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select("business_unit")
      .eq("id", (p as { bank_account_id: string }).bank_account_id)
      .maybeSingle(),
    supabase
      .from("pos_product_variants")
      .select("id", { count: "exact", head: true })
      .eq("product_id", posProductId)
      .eq("active", true),
  ]);
  return {
    brand: (ba as { business_unit?: string } | null)?.business_unit ?? null,
    hasVariants: (count ?? 0) > 0,
  };
}

export async function setPosLink(input: {
  costingId: string;
  pos_product_id: string | null;
  pos_variant_id: string | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();

  // Validasi lintas-brand + varian↔produk. UI hanya menawarkan opsi
  // se-brand, tapi action harus menolak id sembarang (integritas data).
  if (input.pos_product_id) {
    const { data: cp } = await supabase
      .from("costing_products" as never)
      .select("business_unit")
      .eq("id", input.costingId)
      .maybeSingle();
    const cpBu = (cp as { business_unit?: string } | null)?.business_unit;
    const info = await posProductInfo(supabase, input.pos_product_id);
    if (!info) return { ok: false, error: "Produk POS tidak ditemukan" };
    if (cpBu && info.brand && info.brand !== cpBu)
      return { ok: false, error: "Produk POS beda brand" };
    if (input.pos_variant_id) {
      const { data: v } = await supabase
        .from("pos_product_variants")
        .select("product_id")
        .eq("id", input.pos_variant_id)
        .maybeSingle();
      if (
        !v ||
        (v as { product_id: string }).product_id !== input.pos_product_id
      )
        return { ok: false, error: "Varian tidak cocok dengan produk POS" };
    }
  }

  const { error } = await supabase
    .from("costing_products" as never)
    .update({
      pos_product_id: input.pos_product_id,
      pos_variant_id: input.pos_variant_id,
    } as never)
    .eq("id", input.costingId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/costing", "layout");
  return { ok: true };
}

/** Terapkan harga jual rekomendasi (finalPrice) ke produk/varian POS
 *  yang tertaut. Reuse updater POS (gated + revalidate /pos). */
export async function applyRecommendedPriceToPos(
  costingId: string
): Promise<ActionResult<{ price: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data: prodRow } = await supabase
    .from("costing_products" as never)
    .select("*")
    .eq("id", costingId)
    .maybeSingle();
  if (!prodRow) return { ok: false, error: "Produk tidak ditemukan" };
  const product = mapProduct(prodRow as Record<string, unknown>);
  if (!product.pos_product_id)
    return { ok: false, error: "Produk belum ditautkan ke POS" };

  // Link level-produk padahal produk POS punya varian → harga produk
  // diabaikan POS. Tolak (jangan "sukses" menyesatkan) — minta tautkan
  // ke varian tertentu.
  if (!product.pos_variant_id) {
    const info = await posProductInfo(supabase, product.pos_product_id);
    if (info?.hasVariants)
      return {
        ok: false,
        error:
          "Produk POS punya varian — tautkan ke varian tertentu, bukan level produk.",
      };
  }

  // Hitung finalPrice terkini via engine bersama (satu sumber).
  const loaded = await loadBrandCosting(supabase, {
    businessUnit: product.business_unit,
  });
  const items = loaded.itemsByProduct.get(costingId) ?? [];
  const breakdown = breakdownFor(
    product,
    items,
    loaded.materialsById,
    loaded.unitsByCode
  );
  if (breakdown.finalPrice == null)
    return { ok: false, error: "Harga rekomendasi tidak valid (cek margin/yield)" };
  const price = Math.round(breakdown.finalPrice);

  const res = product.pos_variant_id
    ? await updatePosProductVariant({ id: product.pos_variant_id, price })
    : await updatePosProduct({ id: product.pos_product_id, price });
  if (!res.ok) return res;
  revalidatePath("/admin/costing", "layout");
  return { ok: true, data: { price } };
}
