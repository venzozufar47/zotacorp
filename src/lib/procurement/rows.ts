/**
 * Pemuatan + pemetaan baris modul Pengadaan.
 *
 * BUKAN "use server": dipakai server actions maupun (tipe-nya) client.
 * Satu-satunya tempat data pengadaan satu brand dirakit — halaman, papan
 * pantau, dan perhitungan expected saat opname semuanya lewat sini supaya
 * tidak ada dua versi angka. Pola `src/lib/costing/rows.ts`.
 *
 * Tabel pengadaan belum ada di generated types → `.from("x" as never)`,
 * dan setiap kolom numerik WAJIB lewat `num()` (PostgREST mengirim
 * `numeric` sebagai string; lupa koersi = konkatenasi diam-diam).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { num } from "@/lib/costing/rows";
import {
  computeProcurement,
  resolveParams,
  PROCUREMENT_DEFAULTS,
  type ProcurementMaterialLite,
  type ProcurementMetrics,
  type ProcurementParamsRaw,
  type ProcurementSettingsLite,
} from "./calc";

type DB = SupabaseClient<Database>;

/** Berapa opname terakhir yang dipindai untuk mencari baseline tiap bahan.
 *  Dibatasi supaya pembacaan tidak tumbuh tanpa batas; 24 ≈ 6 bulan opname
 *  mingguan. Bahan yang tak pernah dihitung dalam rentang itu dianggap
 *  belum pernah opname (jujur: memang tak ada datanya). */
const OPNAME_SCAN_LIMIT = 24;

export interface ProcurementRow {
  material: ProcurementMaterialLite & {
    category: string | null;
    shopee_url: string | null;
    price_updated_at: string;
  };
  params: ProcurementParamsRaw & {
    supplier: string | null;
    isTracked: boolean;
    notes: string | null;
    /** true = baris parameter sudah ada di DB. */
    exists: boolean;
  };
  metrics: ProcurementMetrics;
  /** ISO opname terakhir yang memuat bahan ini. */
  lastOpnameAt: string | null;
}

export function mapParams(
  r: Record<string, unknown> | undefined
): ProcurementParamsRaw & {
  supplier: string | null;
  isTracked: boolean;
  notes: string | null;
  exists: boolean;
} {
  if (!r) {
    return {
      avgDailyUsage: 0,
      leadTimeDays: 0,
      usageSigmaDaily: null,
      leadTimeSigmaDays: null,
      moqPurchaseUnits: 0,
      orderMultipleUnits: 1,
      serviceLevelOverride: null,
      supplier: null,
      isTracked: true,
      notes: null,
      exists: false,
    };
  }
  const optNum = (v: unknown) => (v == null ? null : num(v));
  return {
    avgDailyUsage: num(r.avg_daily_usage),
    leadTimeDays: num(r.lead_time_days),
    usageSigmaDaily: optNum(r.usage_sigma_daily),
    leadTimeSigmaDays: optNum(r.lead_time_sigma_days),
    moqPurchaseUnits: num(r.moq_purchase_units),
    orderMultipleUnits: num(r.order_multiple_units) || 1,
    serviceLevelOverride: optNum(r.service_level_override),
    supplier: (r.supplier as string | null) ?? null,
    isTracked: (r.is_tracked as boolean | null) ?? true,
    notes: (r.notes as string | null) ?? null,
    exists: true,
  };
}

export function mapSettings(
  r: Record<string, unknown> | null | undefined
): ProcurementSettingsLite {
  if (!r) return { ...PROCUREMENT_DEFAULTS };
  return {
    serviceLevel: num(r.service_level) || PROCUREMENT_DEFAULTS.serviceLevel,
    orderingCost: num(r.ordering_cost),
    holdingRateAnnual: num(r.holding_rate_annual),
    reviewPeriodDays:
      num(r.review_period_days) || PROCUREMENT_DEFAULTS.reviewPeriodDays,
    usageCv: num(r.usage_cv),
  };
}

export async function fetchProcurementSettings(
  supabase: DB
): Promise<ProcurementSettingsLite> {
  const { data } = await supabase
    .from("procurement_settings" as never)
    .select("*")
    .limit(1)
    .maybeSingle();
  return mapSettings(data as Record<string, unknown> | null);
}

/**
 * Rakit seluruh baris pengadaan satu brand pada titik waktu `atIso`.
 *
 * Baseline stok diambil dari opname TERAKHIR YANG MEMUAT bahan itu —
 * bukan sekadar opname terakhir brand — supaya opname parsial (hanya
 * sebagian bahan dihitung) tidak menghapus riwayat bahan lain. Cut-off
 * barang masuk memakai `created_at` (bukan `receipt_date`), sama seperti
 * invarian stok POS: barang yang baru DIKETIK setelah opname tetap
 * dihitung maju, walau tanggal notanya mundur.
 */
export async function loadBrandProcurement(
  supabase: DB,
  opts: { businessUnit: string; atIso?: string; includeUntracked?: boolean }
): Promise<{ rows: ProcurementRow[]; settings: ProcurementSettingsLite }> {
  const atIso = opts.atIso ?? new Date().toISOString();

  const [{ data: matRows }, settings, { data: opnameRows }] = await Promise.all(
    [
      supabase
        .from("costing_materials" as never)
        .select(
          "id, name, category, usage_unit, purchase_unit, purchase_price, content_per_purchase, shopee_url, price_updated_at"
        )
        .eq("business_unit", opts.businessUnit)
        .eq("is_active", true)
        .order("name"),
      fetchProcurementSettings(supabase),
      supabase
        .from("costing_material_opnames" as never)
        .select("id, created_at")
        .eq("business_unit", opts.businessUnit)
        .order("created_at", { ascending: false })
        .limit(OPNAME_SCAN_LIMIT),
    ]
  );

  const materials = (matRows ?? []) as Record<string, unknown>[];
  const ids = materials.map((m) => m.id as string);
  if (ids.length === 0) return { rows: [], settings };

  const opnames = (opnameRows ?? []) as Record<string, unknown>[];
  const opnameAt = new Map<string, string>();
  for (const o of opnames) opnameAt.set(o.id as string, o.created_at as string);

  // Baseline per bahan = item opname terbaru yang memuatnya.
  const baseline = new Map<string, { qty: number; atIso: string }>();
  if (opnames.length > 0) {
    const { data: itemRows } = await supabase
      .from("costing_material_opname_items" as never)
      .select("opname_id, material_id, physical_qty")
      .in("opname_id", Array.from(opnameAt.keys()))
      .in("material_id", ids);
    for (const it of (itemRows ?? []) as Record<string, unknown>[]) {
      const mid = it.material_id as string;
      const at = opnameAt.get(it.opname_id as string);
      if (!at) continue;
      const prev = baseline.get(mid);
      if (!prev || at > prev.atIso)
        baseline.set(mid, { qty: num(it.physical_qty), atIso: at });
    }
  }

  // Barang masuk sejak baseline paling tua — disaring per bahan di JS
  // karena tiap bahan punya cut-off sendiri.
  const receiptsByMaterial = new Map<string, number>();
  if (baseline.size > 0) {
    let oldest: string | null = null;
    for (const b of baseline.values())
      if (!oldest || b.atIso < oldest) oldest = b.atIso;
    const { data: recRows } = await supabase
      .from("costing_material_receipts" as never)
      .select("material_id, qty_usage_units, created_at")
      .eq("business_unit", opts.businessUnit)
      .gt("created_at", oldest!);
    for (const r of (recRows ?? []) as Record<string, unknown>[]) {
      const mid = r.material_id as string;
      const b = baseline.get(mid);
      if (!b) continue; // belum pernah opname → barang masuk diabaikan
      if ((r.created_at as string) <= b.atIso) continue;
      receiptsByMaterial.set(
        mid,
        (receiptsByMaterial.get(mid) ?? 0) + num(r.qty_usage_units)
      );
    }
  }

  const { data: paramRows } = await supabase
    .from("costing_material_procurement" as never)
    .select("*")
    .in("material_id", ids);
  const paramsByMaterial = new Map<string, Record<string, unknown>>();
  for (const p of (paramRows ?? []) as Record<string, unknown>[])
    paramsByMaterial.set(p.material_id as string, p);

  const rows: ProcurementRow[] = [];
  for (const m of materials) {
    const id = m.id as string;
    const params = mapParams(paramsByMaterial.get(id));
    if (!params.isTracked && !opts.includeUntracked) continue;
    const lite: ProcurementMaterialLite = {
      id,
      name: m.name as string,
      usage_unit: m.usage_unit as string,
      purchase_unit: m.purchase_unit as string,
      purchase_price: num(m.purchase_price),
      content_per_purchase: num(m.content_per_purchase),
    };
    const b = baseline.get(id) ?? null;
    const metrics = computeProcurement(lite, resolveParams(params, settings), {
      baselineQty: b ? b.qty : null,
      baselineAtIso: b ? b.atIso : null,
      receiptsSinceQty: receiptsByMaterial.get(id) ?? 0,
      atIso,
    });
    rows.push({
      material: {
        ...lite,
        category: (m.category as string | null) ?? null,
        shopee_url: (m.shopee_url as string | null) ?? null,
        price_updated_at: m.price_updated_at as string,
      },
      params,
      metrics,
      lastOpnameAt: b ? b.atIso : null,
    });
  }
  return { rows, settings };
}

/** Urutan papan pantau: yang paling mendesak di atas. */
export const STATUS_ORDER: Record<ProcurementMetrics["status"], number> = {
  habis: 0,
  kritis: 1,
  menipis: 2,
  belum_opname: 3,
  overstock: 4,
  aman: 5,
};

export function sortByUrgency(rows: ProcurementRow[]): ProcurementRow[] {
  return [...rows].sort((a, b) => {
    const d = STATUS_ORDER[a.metrics.status] - STATUS_ORDER[b.metrics.status];
    if (d !== 0) return d;
    const ac = a.metrics.daysOfCover ?? Number.POSITIVE_INFINITY;
    const bc = b.metrics.daysOfCover ?? Number.POSITIVE_INFINITY;
    if (ac !== bc) return ac - bc;
    return a.material.name.localeCompare(b.material.name, "id");
  });
}
