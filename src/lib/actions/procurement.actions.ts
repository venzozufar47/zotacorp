"use server";

/**
 * Aksi modul Pengadaan untuk STAF (dan admin).
 *
 * Sengaja terpisah dari costing.actions.ts yang tetap `requireAdmin()`:
 * dengan begitu resep, HPP, margin, dan harga jual tak terjangkau staf
 * pengadaan SECARA STRUKTURAL — bukan sekadar disembunyikan di UI.
 *
 * Semua tulis lewat service-role client (melewati RLS), jadi setiap aksi
 * WAJIB dibuka gate `requireProcurementForBu` / `requireProcurementForMaterial`
 * dan tidak boleh mempercayai `business_unit` dari payload.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import {
  requireProcurementForBu,
  requireProcurementForMaterial,
  type ActionResult,
} from "./_gates";
import { normalizeLink, LINK_ERROR } from "@/lib/costing/link";
import { num } from "@/lib/costing/rows";
import {
  loadBrandProcurement,
  sortByUrgency,
  type ProcurementRow,
} from "@/lib/procurement/rows";
import { myProcurementBusinessUnits } from "@/lib/procurement/access";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";

function revalidateProcurement() {
  revalidatePath("/pengadaan", "layout");
  revalidatePath("/admin/costing", "layout");
}

export interface GoodsInRow {
  id: string;
  materialId: string;
  materialName: string;
  qtyPurchaseUnits: number;
  qtyUsageUnits: number;
  unitPricePaid: number | null;
  totalPaid: number | null;
  supplier: string | null;
  receiptDate: string;
  receiptTime: string | null;
  notes: string | null;
  createdAt: string;
}

export interface OpnameSummaryRow {
  id: string;
  opnameDate: string;
  opnameTime: string | null;
  itemCount: number;
  totalDiffQty: number;
  notes: string | null;
}

/** Papan pantau satu brand, sudah diurutkan paling mendesak di atas. */
export async function listProcurementBoard(
  businessUnit: string
): Promise<ActionResult<ProcurementRow[]>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  const { rows } = await loadBrandProcurement(adminClient(), { businessUnit });
  return { ok: true, data: sortByUrgency(rows) };
}

/**
 * Simpan parameter pengadaan satu bahan. HANYA subset yang boleh diisi
 * staf — `service_level_override` sengaja TIDAK ada di sini (itu
 * kebijakan superadmin, lihat procurement-admin.actions.ts).
 */
export async function upsertMaterialParams(input: {
  materialId: string;
  avgDailyUsage?: number;
  leadTimeDays?: number;
  usageSigmaDaily?: number | null;
  leadTimeSigmaDays?: number | null;
  moqPurchaseUnits?: number;
  orderMultipleUnits?: number;
  supplier?: string | null;
  isTracked?: boolean;
  notes?: string | null;
}): Promise<ActionResult> {
  const gate = await requireProcurementForMaterial(input.materialId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const nonNeg = (v: number | undefined | null, label: string) => {
    if (v === undefined || v === null) return null;
    if (!Number.isFinite(v) || v < 0) return `${label} tidak valid`;
    return null;
  };
  const err =
    nonNeg(input.avgDailyUsage, "Pemakaian harian") ??
    nonNeg(input.leadTimeDays, "Lead time") ??
    nonNeg(input.usageSigmaDaily, "Variasi pemakaian") ??
    nonNeg(input.leadTimeSigmaDays, "Variasi lead time") ??
    nonNeg(input.moqPurchaseUnits, "MOQ");
  if (err) return { ok: false, error: err };
  if (
    input.orderMultipleUnits !== undefined &&
    (!Number.isFinite(input.orderMultipleUnits) || input.orderMultipleUnits <= 0)
  )
    return { ok: false, error: "Kelipatan pesan harus > 0" };

  const patch: Record<string, unknown> = {
    material_id: input.materialId,
    // Dari gate, BUKAN dari payload — kalau tidak, klien bisa memalsukan BU.
    business_unit: gate.businessUnit,
    updated_by: gate.userId,
    updated_at: new Date().toISOString(),
  };
  const set = (k: string, v: unknown) => {
    if (v !== undefined) patch[k] = v;
  };
  set("avg_daily_usage", input.avgDailyUsage);
  set("lead_time_days", input.leadTimeDays);
  set("usage_sigma_daily", input.usageSigmaDaily);
  set("lead_time_sigma_days", input.leadTimeSigmaDays);
  set("moq_purchase_units", input.moqPurchaseUnits);
  set("order_multiple_units", input.orderMultipleUnits);
  set("supplier", input.supplier?.trim() || null);
  set("is_tracked", input.isTracked);
  set("notes", input.notes?.trim() || null);

  const { error } = await adminClient()
    .from("costing_material_procurement" as never)
    .upsert(patch as never, { onConflict: "material_id" });
  if (error) return { ok: false, error: error.message };
  revalidateProcurement();
  return { ok: true };
}

/**
 * Perbarui link pembelian. Menulis kolom `costing_materials.shopee_url`
 * YANG SAMA dengan yang diedit admin di Master Bahan — satu sumber
 * kebenaran, tanpa kolom cermin.
 */
export async function updateMaterialPurchaseLink(input: {
  materialId: string;
  url: string | null;
}): Promise<ActionResult> {
  const gate = await requireProcurementForMaterial(input.materialId);
  if (!gate.ok) return { ok: false, error: gate.error };
  const link = normalizeLink(input.url);
  if (link === "invalid") return { ok: false, error: LINK_ERROR };
  const { error } = await adminClient()
    .from("costing_materials" as never)
    .update({ shopee_url: link } as never)
    .eq("id", input.materialId);
  if (error) return { ok: false, error: error.message };
  revalidateProcurement();
  return { ok: true };
}

/**
 * Catat barang masuk (satu langkah, tanpa dokumen PO).
 *
 * `qty_usage_units` DIHITUNG di server dari isi-per-satuan-beli saat ini
 * lalu di-SNAPSHOT — kalau admin mengubah `content_per_purchase` nanti,
 * stok masa lalu tidak ikut bergeser.
 *
 * Harga bahan TIDAK diubah dari sini: itu hak admin (harga menggerakkan
 * HPP & margin yang tak boleh disentuh staf). `unit_price_paid` hanya
 * dicatat sebagai harga aktual belanja.
 */
export async function recordGoodsIn(input: {
  materialId: string;
  qtyPurchaseUnits: number;
  unitPricePaid?: number | null;
  supplier?: string | null;
  receiptDate?: string;
  notes?: string | null;
}): Promise<ActionResult<{ id: string; qtyUsageUnits: number }>> {
  const gate = await requireProcurementForMaterial(input.materialId);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!Number.isFinite(input.qtyPurchaseUnits) || input.qtyPurchaseUnits <= 0)
    return { ok: false, error: "Jumlah harus > 0" };
  if (
    input.unitPricePaid != null &&
    (!Number.isFinite(input.unitPricePaid) || input.unitPricePaid < 0)
  )
    return { ok: false, error: "Harga tidak valid" };

  const supabase = adminClient();
  const { data: matRow } = await supabase
    .from("costing_materials" as never)
    .select("content_per_purchase, purchase_price, shopee_url")
    .eq("id", input.materialId)
    .maybeSingle();
  const mat = matRow as Record<string, unknown> | null;
  if (!mat) return { ok: false, error: "Bahan tidak ditemukan" };
  const content = num(mat.content_per_purchase);
  if (!(content > 0))
    return { ok: false, error: "Isi per satuan beli belum valid" };

  const qtyUsage = input.qtyPurchaseUnits * content;
  const unitPrice = input.unitPricePaid ?? num(mat.purchase_price);
  const now = new Date();

  const { data, error } = await supabase
    .from("costing_material_receipts" as never)
    .insert({
      business_unit: gate.businessUnit,
      material_id: input.materialId,
      qty_purchase_units: input.qtyPurchaseUnits,
      content_per_purchase_snapshot: content,
      qty_usage_units: qtyUsage,
      unit_price_paid: unitPrice,
      total_paid: unitPrice * input.qtyPurchaseUnits,
      supplier: input.supplier?.trim() || null,
      purchase_url_snapshot: (mat.shopee_url as string | null) ?? null,
      receipt_date: input.receiptDate || jakartaDateString(now),
      receipt_time: jakartaHHMM(now),
      notes: input.notes?.trim() || null,
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal" };
  revalidateProcurement();
  return {
    ok: true,
    data: { id: (data as { id: string }).id, qtyUsageUnits: qtyUsage },
  };
}

export async function listGoodsIn(
  businessUnit: string,
  limit = 50
): Promise<ActionResult<GoodsInRow[]>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("costing_material_receipts" as never)
    .select("*")
    .eq("business_unit", businessUnit)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = Array.from(new Set(rows.map((r) => r.material_id as string)));
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: mats } = await supabase
      .from("costing_materials" as never)
      .select("id, name")
      .in("id", ids);
    for (const m of (mats ?? []) as Record<string, unknown>[])
      names.set(m.id as string, m.name as string);
  }
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id as string,
      materialId: r.material_id as string,
      materialName: names.get(r.material_id as string) ?? "(bahan dihapus)",
      qtyPurchaseUnits: num(r.qty_purchase_units),
      qtyUsageUnits: num(r.qty_usage_units),
      unitPricePaid: r.unit_price_paid == null ? null : num(r.unit_price_paid),
      totalPaid: r.total_paid == null ? null : num(r.total_paid),
      supplier: (r.supplier as string | null) ?? null,
      receiptDate: r.receipt_date as string,
      receiptTime: (r.receipt_time as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      createdAt: r.created_at as string,
    })),
  };
}

/** Hapus barang masuk — hanya pencatatnya (atau admin) dan hanya hari ini.
 *  Salah ketik itu lumrah; koreksi yang lebih tua urusan admin agar
 *  riwayat stok tidak bergeser diam-diam. */
export async function deleteGoodsIn(id: string): Promise<ActionResult> {
  const supabase = adminClient();
  const { data: row } = await supabase
    .from("costing_material_receipts" as never)
    .select("business_unit, created_by, created_at")
    .eq("id", id)
    .maybeSingle();
  const rec = row as Record<string, unknown> | null;
  if (!rec) return { ok: false, error: "Data tidak ditemukan" };
  const gate = await requireProcurementForBu(rec.business_unit as string);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.isAdmin) {
    if (rec.created_by !== gate.userId)
      return { ok: false, error: "Hanya pencatatnya yang bisa menghapus" };
    const sameDay =
      jakartaDateString(new Date(rec.created_at as string)) ===
      jakartaDateString(new Date());
    if (!sameDay)
      return { ok: false, error: "Hanya bisa dihapus di hari yang sama" };
  }
  const { error } = await supabase
    .from("costing_material_receipts" as never)
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateProcurement();
  return { ok: true };
}

/** Daftar bahan + estimasi sistem, untuk mengisi form opname. */
export async function startMaterialOpname(
  businessUnit: string
): Promise<ActionResult<ProcurementRow[]>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  const { rows } = await loadBrandProcurement(adminClient(), { businessUnit });
  return {
    ok: true,
    data: [...rows].sort((a, b) =>
      (a.material.category ?? "").localeCompare(b.material.category ?? "", "id") ||
      a.material.name.localeCompare(b.material.name, "id")
    ),
  };
}

/**
 * Commit opname bahan. Mengembalikan `ok:true` + ringkasan selisih —
 * selisih besar BUKAN error; klien yang memutuskan menampilkan konfirmasi
 * (pola submitStockOpname di pos-stock.actions.ts).
 *
 * Seluruh batch ditolak kalau ada satu material_id di luar brand ini —
 * jangan menyaring diam-diam.
 */
export async function submitMaterialOpname(input: {
  businessUnit: string;
  items: { materialId: string; physicalQty: number }[];
  notes?: string | null;
}): Promise<
  ActionResult<{ opnameId: string; totalDiffQty: number; diffItems: number }>
> {
  const gate = await requireProcurementForBu(input.businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!Array.isArray(input.items) || input.items.length === 0)
    return { ok: false, error: "Tidak ada bahan untuk diopname" };
  for (const it of input.items) {
    if (!Number.isFinite(it.physicalQty) || it.physicalQty < 0)
      return { ok: false, error: "Jumlah fisik tidak valid" };
  }

  const supabase = adminClient();
  const { rows } = await loadBrandProcurement(supabase, {
    businessUnit: input.businessUnit,
    includeUntracked: true,
  });
  const byId = new Map(rows.map((r) => [r.material.id, r]));
  for (const it of input.items) {
    if (!byId.has(it.materialId))
      return { ok: false, error: "Ada bahan di luar brand ini" };
  }

  const now = new Date();
  const { data: header, error: hErr } = await supabase
    .from("costing_material_opnames" as never)
    .insert({
      business_unit: input.businessUnit,
      opname_date: jakartaDateString(now),
      opname_time: jakartaHHMM(now),
      notes: input.notes?.trim() || null,
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (hErr || !header) return { ok: false, error: hErr?.message ?? "Gagal" };
  const opnameId = (header as { id: string }).id;

  let totalDiffQty = 0;
  let diffItems = 0;
  const itemRows = input.items.map((it) => {
    const r = byId.get(it.materialId)!;
    const expected = r.metrics.onHandRaw ?? 0;
    const diff = it.physicalQty - expected;
    if (Math.abs(diff) > 1e-6) {
      totalDiffQty += diff;
      diffItems++;
    }
    return {
      opname_id: opnameId,
      material_id: it.materialId,
      material_name_snapshot: r.material.name,
      usage_unit_snapshot: r.material.usage_unit,
      unit_cost_snapshot: r.metrics.unitCost,
      physical_qty: it.physicalQty,
      expected_qty: expected,
    };
  });

  const { error: iErr } = await supabase
    .from("costing_material_opname_items" as never)
    .insert(itemRows as never);
  if (iErr) {
    // Jangan tinggalkan header yatim.
    await supabase
      .from("costing_material_opnames" as never)
      .delete()
      .eq("id", opnameId);
    return { ok: false, error: iErr.message };
  }
  revalidateProcurement();
  return { ok: true, data: { opnameId, totalDiffQty, diffItems } };
}

export async function listMaterialOpnames(
  businessUnit: string,
  limit = 20
): Promise<ActionResult<OpnameSummaryRow[]>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("costing_material_opnames" as never)
    .select("id, opname_date, opname_time, notes")
    .eq("business_unit", businessUnit)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  const heads = (data ?? []) as Record<string, unknown>[];
  if (heads.length === 0) return { ok: true, data: [] };
  const { data: items } = await supabase
    .from("costing_material_opname_items" as never)
    .select("opname_id, physical_qty, expected_qty")
    .in(
      "opname_id",
      heads.map((h) => h.id as string)
    );
  const agg = new Map<string, { n: number; diff: number }>();
  for (const it of (items ?? []) as Record<string, unknown>[]) {
    const k = it.opname_id as string;
    const e = agg.get(k) ?? { n: 0, diff: 0 };
    e.n++;
    e.diff += num(it.physical_qty) - num(it.expected_qty);
    agg.set(k, e);
  }
  return {
    ok: true,
    data: heads.map((h) => ({
      id: h.id as string,
      opnameDate: h.opname_date as string,
      opnameTime: (h.opname_time as string | null) ?? null,
      itemCount: agg.get(h.id as string)?.n ?? 0,
      totalDiffQty: agg.get(h.id as string)?.diff ?? 0,
      notes: (h.notes as string | null) ?? null,
    })),
  };
}

/** Ringkasan untuk banner dashboard karyawan. Sengaja ringan. */
export async function getProcurementDashboardBadge(): Promise<
  ActionResult<{ needBuy: number; staleDays: number | null }>
> {
  const bus = await myProcurementBusinessUnits();
  if (bus.length === 0) return { ok: true, data: { needBuy: 0, staleDays: null } };
  const supabase = adminClient();
  let needBuy = 0;
  let oldest: number | null = null;
  for (const bu of bus) {
    const { rows } = await loadBrandProcurement(supabase, { businessUnit: bu });
    for (const r of rows) {
      if (
        r.metrics.status === "habis" ||
        r.metrics.status === "kritis" ||
        r.metrics.status === "menipis"
      )
        needBuy++;
      const d = r.metrics.elapsedDays;
      if (d != null && (oldest == null || d > oldest)) oldest = d;
    }
  }
  return {
    ok: true,
    data: { needBuy, staleDays: oldest == null ? null : Math.floor(oldest) },
  };
}
