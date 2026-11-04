"use server";

/**
 * Pesanan bahan baku: pembelian yang sudah dipesan/dibayar tetapi belum tiba. Disimpan sebagai baris
 * `costing_material_receipts` dengan `arrived_at` NULL (dibuat lewat "Catat belanja" mode dipesan). Stok baru
 * bertambah saat barang dikonfirmasi tiba di sini. Selisih hari kerja dipesan→tiba menjadi lead time nyata.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireProcurementForBu, type ActionResult } from "./_gates";
import { num } from "@/lib/costing/rows";
import { rebuildBrandUsage } from "@/lib/procurement/brand-store";
import { lateWorkingDays } from "@/lib/procurement/lead-time";
import { jakartaDateString } from "@/lib/utils/jakarta";

function revalidate() {
  revalidatePath("/pengadaan", "layout");
  revalidatePath("/admin/costing", "layout");
}

export interface OrderRow {
  id: string;
  materialId: string;
  materialName: string;
  purchaseUnit: string;
  qtyPurchaseUnits: number;
  totalPaid: number | null;
  supplier: string | null;
  /** Tanggal pesan (kalender Jakarta, YYYY-MM-DD). */
  orderedDate: string | null;
  expectedAt: string | null;
  /** Hari kerja lewat dari perkiraan tiba (0 = belum telat). */
  lateDays: number;
  arrivedAt: string | null;
  /** Konfirmasi tiba masih bisa diurungkan (10 menit pertama). */
  undoable: boolean;
}

export interface OrdersData {
  inTransit: OrderRow[];
  /** Pesanan yang tiba 14 hari terakhir. */
  arrived: OrderRow[];
}

const ARRIVED_WINDOW_DAYS = 14;

export async function listOrders(businessUnit: string): Promise<ActionResult<OrdersData>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = adminClient();
  const since = new Date(Date.now() - ARRIVED_WINDOW_DAYS * 86_400_000).toISOString();
  const cols = "id, material_id, qty_purchase_units, total_paid, supplier, ordered_at, expected_at, arrived_at";
  const [{ data: transit, error: e1 }, { data: done, error: e2 }] = await Promise.all([
    db
      .from("costing_material_receipts" as never)
      .select(cols)
      .eq("business_unit", businessUnit)
      .is("arrived_at", null)
      .order("expected_at", { ascending: true, nullsFirst: false })
      .limit(300),
    db
      .from("costing_material_receipts" as never)
      .select(cols)
      .eq("business_unit", businessUnit)
      .not("ordered_at", "is", null)
      .gte("arrived_at", since)
      .order("arrived_at", { ascending: false })
      .limit(100),
  ]);
  if (e1 || e2) return { ok: false, error: (e1 ?? e2)!.message };
  const all = [...((transit ?? []) as Record<string, unknown>[]), ...((done ?? []) as Record<string, unknown>[])];
  const ids = [...new Set(all.map((r) => r.material_id as string))];
  const mats = new Map<string, { name: string; unit: string }>();
  if (ids.length > 0) {
    const { data } = await db.from("costing_materials" as never).select("id, name, purchase_unit").in("id", ids);
    for (const m of (data ?? []) as Record<string, unknown>[])
      mats.set(m.id as string, { name: m.name as string, unit: m.purchase_unit as string });
  }
  const today = jakartaDateString(new Date());
  const map = (r: Record<string, unknown>): OrderRow => {
    const m = mats.get(r.material_id as string);
    const expectedAt = (r.expected_at as string | null) ?? null;
    return {
      id: r.id as string,
      materialId: r.material_id as string,
      materialName: m?.name ?? "(bahan dihapus)",
      purchaseUnit: m?.unit ?? "",
      qtyPurchaseUnits: num(r.qty_purchase_units),
      totalPaid: r.total_paid == null ? null : num(r.total_paid),
      supplier: (r.supplier as string | null) ?? null,
      orderedDate: r.ordered_at ? jakartaDateString(new Date(r.ordered_at as string)) : null,
      expectedAt,
      lateDays: r.arrived_at ? 0 : lateWorkingDays(expectedAt, today),
      arrivedAt: (r.arrived_at as string | null) ?? null,
      undoable: r.arrived_at != null && Date.now() - Date.parse(r.arrived_at as string) <= 10 * 60_000,
    };
  };
  return {
    ok: true,
    data: {
      inTransit: ((transit ?? []) as Record<string, unknown>[]).map(map),
      arrived: ((done ?? []) as Record<string, unknown>[]).map(map),
    },
  };
}

/**
 * Konfirmasi barang tiba. `qtyPurchaseUnits` kurang dari pesanan = tiba sebagian: baris ini diperkecil jadi yang tiba,
 * sisanya menjadi baris baru yang masih dalam perjalanan (nilai bayar dibagi sebanding).
 */
export async function confirmArrival(input: {
  receiptId: string;
  qtyPurchaseUnits?: number;
}): Promise<ActionResult<{ partial: boolean }>> {
  const db = adminClient();
  const { data: row } = await db.from("costing_material_receipts" as never).select("*").eq("id", input.receiptId).maybeSingle();
  const rec = row as Record<string, unknown> | null;
  if (!rec) return { ok: false, error: "Pesanan tidak ditemukan" };
  const gate = await requireProcurementForBu(rec.business_unit as string);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (rec.arrived_at != null) return { ok: false, error: "Pesanan ini sudah dikonfirmasi tiba" };

  const ordered = num(rec.qty_purchase_units);
  const got = input.qtyPurchaseUnits ?? ordered;
  if (!Number.isFinite(got) || got <= 0) return { ok: false, error: "Jumlah tiba harus lebih dari 0" };
  if (got > ordered + 1e-9) return { ok: false, error: "Jumlah tiba melebihi jumlah pesanan" };

  const nowIso = new Date().toISOString();
  const partial = got < ordered - 1e-9;
  if (!partial) {
    const { error } = await db
      .from("costing_material_receipts" as never)
      .update({ arrived_at: nowIso } as never)
      .eq("id", input.receiptId)
      .is("arrived_at", null);
    if (error) return { ok: false, error: error.message };
  } else {
    const ratio = got / ordered;
    const content = num(rec.content_per_purchase_snapshot);
    const total = rec.total_paid == null ? null : num(rec.total_paid);
    const remainder = {
      ...rec,
      id: undefined,
      qty_purchase_units: ordered - got,
      qty_usage_units: (ordered - got) * content,
      total_paid: total == null ? null : Math.round(total * (1 - ratio)),
      arrived_at: null,
    };
    delete (remainder as Record<string, unknown>).id;
    // Sisa dibuat dulu: kalau gagal, pesanan asli tidak berubah.
    const { error: insErr } = await db.from("costing_material_receipts" as never).insert(remainder as never);
    if (insErr) return { ok: false, error: insErr.message };
    const { error } = await db
      .from("costing_material_receipts" as never)
      .update({
        qty_purchase_units: got,
        qty_usage_units: got * content,
        total_paid: total == null ? null : total - Math.round(total * (1 - ratio)),
        arrived_at: nowIso,
      } as never)
      .eq("id", input.receiptId)
      .is("arrived_at", null);
    if (error) return { ok: false, error: error.message };
  }
  if (rec.brand_id) await rebuildBrandUsage(db, rec.material_id as string).catch(() => undefined);
  revalidate();
  return { ok: true, data: { partial } };
}

/** Urungkan konfirmasi tiba yang salah klik: hanya dalam 10 menit pertama. Tiba sebagian: sisa tidak digabung kembali. */
export async function undoArrival(receiptId: string): Promise<ActionResult> {
  const db = adminClient();
  const { data: row } = await db.from("costing_material_receipts" as never).select("*").eq("id", receiptId).maybeSingle();
  const rec = row as Record<string, unknown> | null;
  if (!rec) return { ok: false, error: "Pesanan tidak ditemukan" };
  const gate = await requireProcurementForBu(rec.business_unit as string);
  if (!gate.ok) return { ok: false, error: gate.error };
  if (rec.arrived_at == null || rec.ordered_at == null) return { ok: false, error: "Tidak ada konfirmasi yang bisa diurungkan" };
  if (Date.now() - Date.parse(rec.arrived_at as string) > 10 * 60_000)
    return { ok: false, error: "Konfirmasi tiba hanya bisa diurungkan dalam 10 menit" };
  const { error } = await db
    .from("costing_material_receipts" as never)
    .update({ arrived_at: null } as never)
    .eq("id", receiptId);
  if (error) return { ok: false, error: error.message };
  if (rec.brand_id) await rebuildBrandUsage(db, rec.material_id as string).catch(() => undefined);
  revalidate();
  return { ok: true };
}
