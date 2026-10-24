"use server";

/**
 * Daftar bahan baku dikelola petugas pengadaan sendiri (tambah bahan, ubah detail, nonaktifkan) — sepengetahuan
 * owner, tanpa owner harus mengerjakan hal teknis. Pengamannya:
 *  - HARGA ACUAN tidak diedit bebas di sini: harga bergerak lewat nota belanja (rata-rata tertimbang) atau owner
 *    (Master Bahan). Satu-satunya pengecualian: isi per kemasan / satuan beli berubah → harga baru wajib diisi
 *    (harga lama tak lagi berlaku), dicatat + owner diberi tahu.
 *  - SATUAN PAKAI terkunci begitu dipakai resep / barang masuk / opname (angka lama tersimpan dalam satuan itu).
 *    Barang masuk menyimpan snapshot isi per kemasan, jadi stok masa lalu tak ikut berubah saat isi diubah.
 *  - Setiap perubahan dicatat (siapa, kapan, dari → ke) di `costing_material_changes`.
 *  - Perubahan yang memengaruhi HPP/stok (isi per kemasan, satuan pakai, nonaktif) mengirim notifikasi ke owner.
 *  - Owner cukup menekan "Sudah dilihat" atau "Urungkan" di halaman admin Nota Belanja.
 * Resep & margin tetap tak terjangkau (gate + tabel tersebut admin-only).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, requireProcurementForBu, requireProcurementForMaterial, type ActionResult } from "./_gates";
import { normalizeLink, LINK_ERROR } from "@/lib/costing/link";
import { num } from "@/lib/costing/rows";
import { sendPushToAdmins } from "@/lib/push/web-push";
import { isPurchaseUnit } from "@/lib/costing/unit-options";

type Admin = ReturnType<typeof createAdminClient>;

const BASE_USAGE_UNITS = ["gram", "ml", "pcs", "meter", "pack"];
const NOTE_PATH = "/admin/costing/pengadaan/nota";

function revalidateAll() {
  revalidatePath("/pengadaan", "layout");
  revalidatePath("/admin/costing", "layout");
}

function escapeIlike(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface MaterialDetail {
  id: string;
  name: string;
  category: string | null;
  purchaseUnit: string;
  purchasePrice: number;
  contentPerPurchase: number;
  usageUnit: string;
  shopeeUrl: string | null;
  isActive: boolean;
  /** Diajukan petugas, belum dilihat owner. */
  pending: boolean;
  /** Jumlah resep yang memakai bahan ini (bahan terpakai resep tak bisa dinonaktifkan petugas). */
  recipeCount: number;
  /** Satuan pakai terkunci: sudah dipakai resep, barang masuk, atau opname (mengubahnya membuat angka lama salah arti). */
  usageUnitLocked: boolean;
}

export async function listMaterialDetails(businessUnit: string): Promise<ActionResult<MaterialDetail[]>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("costing_materials" as never)
    .select(
      "id, name, category, purchase_unit, purchase_price, content_per_purchase, usage_unit, shopee_url, is_active, review_status"
    )
    .eq("business_unit", businessUnit)
    .order("name");
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => r.id as string);
  const counts = await recipeCounts(admin, ids);
  const withHistory = await materialsWithStockHistory(admin, ids);
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      category: (r.category as string | null) ?? null,
      purchaseUnit: r.purchase_unit as string,
      purchasePrice: num(r.purchase_price),
      contentPerPurchase: num(r.content_per_purchase),
      usageUnit: r.usage_unit as string,
      shopeeUrl: (r.shopee_url as string | null) ?? null,
      isActive: r.is_active === true,
      pending: r.review_status === "pending",
      recipeCount: counts.get(r.id as string) ?? 0,
      usageUnitLocked: (counts.get(r.id as string) ?? 0) > 0 || withHistory.has(r.id as string),
    })),
  };
}

async function recipeCounts(admin: Admin, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin
      .from("costing_recipe_items" as never)
      .select("material_id")
      .in("material_id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as { material_id: string }[]) out.set(r.material_id, (out.get(r.material_id) ?? 0) + 1);
  }
  return out;
}

/** Bahan yang sudah punya barang masuk atau opname: angkanya tersimpan dalam satuan pakai yang berlaku saat itu. */
async function materialsWithStockHistory(admin: Admin, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    for (const table of ["costing_material_receipts", "costing_material_opname_items"]) {
      const { data } = await admin.from(table as never).select("material_id").in("material_id", chunk);
      for (const r of (data ?? []) as { material_id: string }[]) out.add(r.material_id);
    }
  }
  return out;
}

export interface SaveMaterialInput {
  businessUnit: string;
  /** Kosong = bahan baru. */
  id?: string;
  name: string;
  category?: string | null;
  purchaseUnit: string;
  contentPerPurchase: number;
  usageUnit: string;
  shopeeUrl?: string | null;
  /**
   * Bahan BARU: harga acuan awal. Bahan yang ada: harga diubah lewat nota belanja, KECUALI isi per kemasan atau
   * satuan beli berubah — harga per satuan beli lama tak lagi berlaku, jadi harga baru wajib diisi.
   */
  purchasePrice?: number;
}

const FIELD_LABEL: Record<string, string> = {
  name: "nama",
  category: "kategori",
  purchase_unit: "satuan beli",
  content_per_purchase: "isi per kemasan",
  usage_unit: "satuan pakai",
  purchase_price: "harga per satuan beli",
  shopee_url: "link beli",
};

async function actorName(admin: Admin, userId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("full_name, nickname").eq("id", userId).maybeSingle();
  return data?.nickname || data?.full_name || "petugas pengadaan";
}

async function notifyOwner(admin: Admin, userId: string, businessUnit: string, name: string, summary: string) {
  try {
    await sendPushToAdmins({
      title: "Daftar bahan diubah",
      body: `${await actorName(admin, userId)} · ${businessUnit.replace("Haengbocake ", "")} · ${name}: ${summary}`.slice(0, 160),
      url: NOTE_PATH,
    });
  } catch {
    // Notifikasi gagal tak boleh membatalkan perubahan yang sudah tercatat.
  }
}

/** Riwayat harga + isi saat ini (repricing produk terdampak bergantung padanya). */
async function logPriceHistory(admin: Admin, materialId: string, userId: string) {
  const { data } = await admin
    .from("costing_materials" as never)
    .select("purchase_price, content_per_purchase")
    .eq("id", materialId)
    .maybeSingle();
  const m = data as { purchase_price: unknown; content_per_purchase: unknown } | null;
  if (!m) return;
  await admin.from("costing_material_price_history" as never).insert({
    material_id: materialId,
    purchase_price: num(m.purchase_price),
    content_per_purchase: num(m.content_per_purchase),
    created_by: userId,
  } as never);
}

export async function saveMaterial(input: SaveMaterialInput): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const purchaseUnit = input.purchaseUnit.trim();
  const usageUnit = input.usageUnit.trim().toLowerCase();
  const category = input.category?.trim() || null;
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Nama bahan 2–80 huruf" };
  if (!purchaseUnit || purchaseUnit.length > 20) return { ok: false, error: "Satuan beli wajib (mis. sak, dus, pack)" };
  // Satuan beli baku (dropdown), kecuali bila tidak diubah dari nilai lama bahan ini (dicek di cabang ubah).
  const purchaseUnitStandard = isPurchaseUnit(purchaseUnit);
  if (!(input.contentPerPurchase > 0) || input.contentPerPurchase > 10_000_000)
    return { ok: false, error: "Isi per satuan beli harus lebih dari 0" };
  if (category && category.length > 40) return { ok: false, error: "Kategori maksimal 40 huruf" };
  const link = normalizeLink(input.shopeeUrl);
  if (link === "invalid") return { ok: false, error: LINK_ERROR };

  const admin = createAdminClient();

  // ── bahan baru ──
  if (!input.id) {
    const gate = await requireProcurementForBu(input.businessUnit);
    if (!gate.ok) return { ok: false, error: gate.error };
    if (!BASE_USAGE_UNITS.includes(usageUnit)) return { ok: false, error: "Satuan pakai harus gram, ml, pcs, meter, atau pack" };
    if (!purchaseUnitStandard) return { ok: false, error: "Pilih satuan beli dari daftar" };
    if (!(input.purchasePrice && input.purchasePrice > 0)) return { ok: false, error: "Harga beli awal harus lebih dari 0" };
    const { data: dup } = await admin
      .from("costing_materials" as never)
      .select("id")
      .eq("business_unit", input.businessUnit)
      .ilike("name", escapeIlike(name))
      .maybeSingle();
    if (dup) return { ok: false, error: "Bahan dengan nama itu sudah ada" };
    const { data, error } = await admin
      .from("costing_materials" as never)
      .insert({
        business_unit: input.businessUnit,
        name,
        category,
        purchase_unit: purchaseUnit,
        purchase_price: Math.round(input.purchasePrice * 100) / 100,
        content_per_purchase: input.contentPerPurchase,
        usage_unit: usageUnit,
        shopee_url: link,
        review_status: "pending",
        proposed_by: gate.userId,
        created_by: gate.userId,
      } as never)
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Gagal menambah bahan" };
    const newId = (data as { id: string }).id;
    await admin.from("costing_material_changes" as never).insert({
      material_id: newId,
      business_unit: input.businessUnit,
      material_name: name,
      action: "create",
      changes: {
        purchase_unit: { from: null, to: purchaseUnit },
        content_per_purchase: { from: null, to: input.contentPerPurchase },
        usage_unit: { from: null, to: usageUnit },
        purchase_price: { from: null, to: input.purchasePrice },
      },
      sensitive: false,
      changed_by: gate.userId,
    } as never);
    revalidateAll();
    return { ok: true, data: { id: newId } };
  }

  // ── ubah bahan ──
  const gate = await requireProcurementForMaterial(input.id);
  if (!gate.ok) return { ok: false, error: gate.error };
  const { data: curRow } = await admin
    .from("costing_materials" as never)
    .select("id, business_unit, name, category, purchase_unit, content_per_purchase, usage_unit, shopee_url, is_active, purchase_price")
    .eq("id", input.id)
    .maybeSingle();
  const cur = curRow as Record<string, unknown> | null;
  if (!cur) return { ok: false, error: "Bahan tidak ditemukan" };
  if (!purchaseUnitStandard && purchaseUnit.toLowerCase() !== String(cur.purchase_unit).toLowerCase())
    return { ok: false, error: "Pilih satuan beli dari daftar" };
  // Satuan pakai boleh tetap seperti semula (data lama), tapi satuan baru harus gram/ml/pcs/meter/pack.
  if (usageUnit !== String(cur.usage_unit).toLowerCase() && !BASE_USAGE_UNITS.includes(usageUnit))
    return { ok: false, error: "Satuan pakai harus gram, ml, pcs, meter, atau pack" };
  // Satuan pakai dipakai semua resep (satuan resep kosong = ikut satuan pakai bahan), stok barang masuk, dan opname:
  // mengubahnya diam-diam membuat gram jadi ml. Setelah dipakai, hanya owner yang boleh.
  if (usageUnit !== String(cur.usage_unit).toLowerCase()) {
    const used = (await recipeCounts(admin, [input.id])).get(input.id) ?? 0;
    const hist = (await materialsWithStockHistory(admin, [input.id])).has(input.id);
    if (used > 0 || hist)
      return {
        ok: false,
        error: "Satuan pakai sudah dipakai di resep/stok sehingga tidak bisa diubah di sini. Minta owner.",
      };
  }
  const packChanged =
    num(cur.content_per_purchase) !== input.contentPerPurchase ||
    String(cur.purchase_unit).trim().toLowerCase() !== purchaseUnit.toLowerCase();
  if (packChanged && !(input.purchasePrice && input.purchasePrice > 0))
    return {
      ok: false,
      error: "Isi/satuan beli berubah — isi harga baru per satuan beli (harga lama sudah tidak sesuai).",
    };

  if (name.toLowerCase() !== String(cur.name).toLowerCase()) {
    const { data: dup } = await admin
      .from("costing_materials" as never)
      .select("id")
      .eq("business_unit", gate.businessUnit)
      .ilike("name", escapeIlike(name))
      .neq("id", input.id)
      .maybeSingle();
    if (dup) return { ok: false, error: "Bahan lain dengan nama itu sudah ada" };
  }

  const next: Record<string, unknown> = {
    name,
    category,
    purchase_unit: purchaseUnit,
    content_per_purchase: input.contentPerPurchase,
    usage_unit: usageUnit,
    shopee_url: link,
  };
  if (packChanged) next.purchase_price = Math.round((input.purchasePrice as number) * 100) / 100;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(next)) {
    const before = k === "content_per_purchase" || k === "purchase_price" ? num(cur[k]) : (cur[k] ?? null);
    const after = next[k] ?? null;
    if (before !== after) changes[k] = { from: before, to: after };
  }
  if (Object.keys(changes).length === 0) return { ok: true, data: { id: input.id } };

  const sensitive = "content_per_purchase" in changes || "usage_unit" in changes || "purchase_price" in changes;
  const { error } = await admin
    .from("costing_materials" as never)
    .update({
      ...next,
      updated_at: new Date().toISOString(),
      ...("purchase_price" in changes || "content_per_purchase" in changes
        ? { price_updated_at: new Date().toISOString() }
        : {}),
    } as never)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  if ("purchase_price" in changes || "content_per_purchase" in changes) await logPriceHistory(admin, input.id, gate.userId);

  await admin.from("costing_material_changes" as never).insert({
    material_id: input.id,
    business_unit: gate.businessUnit,
    material_name: name,
    action: "update",
    changes,
    sensitive,
    changed_by: gate.userId,
  } as never);
  if (sensitive) {
    await notifyOwner(
      admin,
      gate.userId,
      gate.businessUnit,
      name,
      Object.keys(changes)
        .map((k) => FIELD_LABEL[k] ?? k)
        .join(", ") + " diubah"
    );
  }
  revalidateAll();
  return { ok: true, data: { id: input.id } };
}

/** Nonaktifkan / aktifkan lagi. Bahan yang dipakai resep tidak bisa dinonaktifkan petugas (urusan owner). */
export async function setMaterialActive(input: { id: string; active: boolean }): Promise<ActionResult> {
  const gate = await requireProcurementForMaterial(input.id);
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient();
  const { data } = await admin
    .from("costing_materials" as never)
    .select("name, is_active")
    .eq("id", input.id)
    .maybeSingle();
  const m = data as { name: string; is_active: boolean } | null;
  if (!m) return { ok: false, error: "Bahan tidak ditemukan" };
  if (m.is_active === input.active) return { ok: true };
  if (!input.active) {
    const n = (await recipeCounts(admin, [input.id])).get(input.id) ?? 0;
    if (n > 0)
      return { ok: false, error: `Bahan ini dipakai di ${n} resep — minta owner untuk menonaktifkannya.` };
  }
  const { error } = await admin
    .from("costing_materials" as never)
    .update({ is_active: input.active, updated_at: new Date().toISOString() } as never)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  await admin.from("costing_material_changes" as never).insert({
    material_id: input.id,
    business_unit: gate.businessUnit,
    material_name: m.name,
    action: input.active ? "reactivate" : "deactivate",
    changes: { is_active: { from: m.is_active, to: input.active } },
    sensitive: true,
    changed_by: gate.userId,
  } as never);
  await notifyOwner(admin, gate.userId, gate.businessUnit, m.name, input.active ? "diaktifkan lagi" : "dinonaktifkan");
  revalidateAll();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
//  Sisi owner: lihat & urungkan
// ─────────────────────────────────────────────────────────────────────

export interface MaterialChangeView {
  id: string;
  businessUnit: string;
  materialName: string;
  action: "update" | "deactivate" | "reactivate" | "create";
  /** Ringkasan terbaca: "isi per kemasan: 1000 → 25000". */
  summary: string[];
  sensitive: boolean;
  changedByName: string | null;
  createdAt: string;
  ackedAt: string | null;
  revertedAt: string | null;
}

function show(v: unknown): string {
  return v == null || v === "" ? "—" : String(v);
}

export async function listMaterialChanges(
  opts: { onlyUnseen?: boolean; limit?: number } = {}
): Promise<ActionResult<MaterialChangeView[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient();
  let q = admin
    .from("costing_material_changes" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(opts.limit ?? 30, 100));
  if (opts.onlyUnseen) q = q.is("acked_at", null);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(rows.map((r) => r.changed_by as string | null).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ps } = await admin.from("profiles").select("id, full_name, nickname").in("id", ids);
    for (const p of ps ?? []) names.set(p.id, p.nickname || p.full_name || "—");
  }
  return {
    ok: true,
    data: rows.map((r) => {
      const ch = (r.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
      return {
        id: r.id as string,
        businessUnit: r.business_unit as string,
        materialName: r.material_name as string,
        action: r.action as MaterialChangeView["action"],
        summary: Object.entries(ch).map(([k, v]) =>
          k === "is_active"
            ? v.to ? "diaktifkan lagi" : "dinonaktifkan"
            : `${FIELD_LABEL[k] ?? k}: ${show(v.from)} → ${show(v.to)}`
        ),
        sensitive: r.sensitive === true,
        changedByName: r.changed_by ? names.get(r.changed_by as string) ?? null : null,
        createdAt: r.created_at as string,
        ackedAt: (r.acked_at as string | null) ?? null,
        revertedAt: (r.reverted_at as string | null) ?? null,
      };
    }),
  };
}

export async function ackMaterialChange(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { error } = await createAdminClient()
    .from("costing_material_changes" as never)
    .update({ acked_by: gate.userId, acked_at: new Date().toISOString() } as never)
    .eq("id", id)
    .is("acked_at", null);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function ackAllMaterialChanges(): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { error } = await createAdminClient()
    .from("costing_material_changes" as never)
    .update({ acked_by: gate.userId, acked_at: new Date().toISOString() } as never)
    .is("acked_at", null);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

/**
 * Urungkan satu perubahan: kembalikan nilai lama. Hanya bila nilai sekarang masih sama dengan hasil perubahan
 * itu (belum diubah lagi) — kalau tidak, mengurungkan akan menimpa perubahan yang lebih baru.
 */
export async function revertMaterialChange(id: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const admin = createAdminClient();
  const { data } = await admin.from("costing_material_changes" as never).select("*").eq("id", id).maybeSingle();
  const c = data as Record<string, unknown> | null;
  if (!c) return { ok: false, error: "Catatan tidak ditemukan" };
  if (c.reverted_at) return { ok: false, error: "Perubahan ini sudah diurungkan" };
  if (!c.material_id) return { ok: false, error: "Bahannya sudah dihapus" };
  const ch = (c.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
  const { data: matRow } = await admin
    .from("costing_materials" as never)
    .select("*")
    .eq("id", c.material_id as string)
    .maybeSingle();
  const mat = matRow as Record<string, unknown> | null;
  if (!mat) return { ok: false, error: "Bahannya sudah dihapus" };
  for (const [k, v] of Object.entries(ch)) {
    const nowVal = k === "content_per_purchase" || k === "purchase_price" ? num(mat[k]) : (mat[k] ?? null);
    if (nowVal !== (v.to ?? null))
      return { ok: false, error: "Sudah diubah lagi setelah itu — tidak bisa diurungkan otomatis. Ubah manual di Master Bahan." };
  }
  const restore: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ch)) restore[k] = v.from ?? null;
  const { error } = await admin
    .from("costing_materials" as never)
    .update({
      ...restore,
      updated_at: new Date().toISOString(),
      ...("purchase_price" in ch || "content_per_purchase" in ch ? { price_updated_at: new Date().toISOString() } : {}),
    } as never)
    .eq("id", c.material_id as string);
  if (error) return { ok: false, error: error.message };
  if ("purchase_price" in ch || "content_per_purchase" in ch) await logPriceHistory(admin, c.material_id as string, gate.userId);
  await admin
    .from("costing_material_changes" as never)
    .update({
      reverted_at: new Date().toISOString(),
      acked_by: gate.userId,
      acked_at: (c.acked_at as string | null) ?? new Date().toISOString(),
    } as never)
    .eq("id", id);
  revalidateAll();
  return { ok: true };
}
