"use server";

/**
 * Merek bahan di Pengadaan (PRD docs/pengadaan/prd-merek-bahan.md). Merek didaftarkan staf pengadaan (dari nota atau tab
 * Bahan), data halal dilengkapi belakangan, dan satu merek per bahan ditandai "sedang dipakai". Semua tulis lewat
 * service-role di balik gate pengadaan per bahan/cabang (`business_unit` tidak pernah dipercaya dari payload).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, requireProcurementForBu, requireProcurementForMaterial, type ActionResult } from "./_gates";
import { jakartaDateString } from "@/lib/utils/jakarta";
import {
  brandMissing,
  brandNameError,
  certExpiry,
  cleanBrandName,
  findOrCreateBrand,
  setActiveBrandManual,
} from "@/lib/procurement/brand-store";

type Admin = ReturnType<typeof createAdminClient>;

const CERT_BUCKET = "cashflow-receipts";
const CERT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const CERT_MAX = 5 * 1024 * 1024;
const HALAL_STATUSES = ["bersertifikat", "tidak_wajib", "belum_dicek"] as const;
export type HalalStatus = (typeof HALAL_STATUSES)[number];
const HALAL_KINDS = ["baku", "tambahan", "penolong"] as const;
export type HalalKind = (typeof HALAL_KINDS)[number];

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function revalidateAll() {
  revalidatePath("/pengadaan", "layout");
  revalidatePath("/admin/costing", "layout");
}

export interface BrandView {
  id: string;
  materialId: string;
  name: string;
  producer: string | null;
  country: string | null;
  halalStatus: HalalStatus;
  halalIssuer: string | null;
  halalCertNo: string | null;
  halalValidUntil: string | null;
  halalNote: string | null;
  hasDoc: boolean;
  isActive: boolean;
  /** Merek yang sedang dipakai untuk bahan ini. */
  isCurrent: boolean;
  /** Data halal yang masih kurang (kosong = lengkap). */
  missing: string[];
  expiry: "habis" | "segera" | null;
}

function toView(r: Record<string, unknown>, currentBrandId: string | null, today: string): BrandView {
  const base = {
    halal_status: r.halal_status as string,
    producer: (r.producer as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    halal_issuer: (r.halal_issuer as string | null) ?? null,
    halal_cert_no: (r.halal_cert_no as string | null) ?? null,
    halal_valid_until: (r.halal_valid_until as string | null) ?? null,
  };
  return {
    id: r.id as string,
    materialId: r.material_id as string,
    name: r.name as string,
    producer: base.producer,
    country: base.country,
    halalStatus: (HALAL_STATUSES as readonly string[]).includes(base.halal_status) ? (base.halal_status as HalalStatus) : "belum_dicek",
    halalIssuer: base.halal_issuer,
    halalCertNo: base.halal_cert_no,
    halalValidUntil: base.halal_valid_until,
    halalNote: (r.halal_note as string | null) ?? null,
    hasDoc: !!r.halal_doc_path,
    isActive: r.is_active === true,
    isCurrent: currentBrandId === (r.id as string),
    missing: brandMissing(base),
    expiry: base.halal_status === "bersertifikat" ? certExpiry(base.halal_valid_until, today) : null,
  };
}

async function currentBrandOf(admin: Admin, materialId: string): Promise<string | null> {
  const { data } = await admin.from("costing_material_brand_usage" as never).select("brand_id").eq("material_id", materialId).is("ended_on", null).maybeSingle();
  return (data as { brand_id?: string } | null)?.brand_id ?? null;
}

/** Catat perubahan merek di umpan perubahan daftar bahan (dilihat owner). Kunci diawali "merek" agar tidak ikut "Urungkan". */
async function logBrandChange(
  admin: Admin,
  input: { materialId: string; businessUnit: string; materialName: string; brandName: string; changes: Record<string, { from: unknown; to: unknown }>; sensitive: boolean; userId: string; action: "create" | "update" }
) {
  const keyed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(input.changes)) keyed[`merek ${input.brandName} · ${k}`] = v;
  await admin.from("costing_material_changes" as never).insert({
    material_id: input.materialId,
    business_unit: input.businessUnit,
    material_name: input.materialName,
    action: input.action,
    changes: keyed,
    sensitive: input.sensitive,
    changed_by: input.userId,
  } as never);
}

async function materialName(admin: Admin, materialId: string): Promise<string> {
  const { data } = await admin.from("costing_materials" as never).select("name").eq("id", materialId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? "(bahan)";
}

/** Merek + gate akses lewat bahan induknya. */
async function loadBrandWithGate(brandId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("costing_material_brands" as never).select("*").eq("id", brandId).maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return { ok: false as const, error: "Merek tidak ditemukan" };
  const gate = await requireProcurementForMaterial(row.material_id as string);
  if (!gate.ok) return { ok: false as const, error: gate.error };
  return { ok: true as const, admin, row, gate };
}

/** Semua merek satu bahan (aktif dulu, yang sedang dipakai paling atas). */
export async function listMaterialBrands(materialId: string): Promise<ActionResult<BrandView[]>> {
  const gate = await requireProcurementForMaterial(materialId);
  if (!gate.ok) return fail(gate.error);
  const admin = createAdminClient();
  const [{ data }, current] = await Promise.all([
    admin.from("costing_material_brands" as never).select("*").eq("material_id", materialId).order("name"),
    currentBrandOf(admin, materialId),
  ]);
  const today = jakartaDateString(new Date());
  const views = ((data ?? []) as Record<string, unknown>[]).map((r) => toView(r, current, today));
  views.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "id"));
  return { ok: true, data: views };
}

/** Daftarkan merek baru (dari tab Bahan). Nama kembar mengembalikan merek yang sudah ada. */
export async function registerBrand(input: {
  materialId: string;
  name: string;
  producer?: string | null;
  country?: string | null;
}): Promise<ActionResult<{ id: string; existed: boolean }>> {
  const gate = await requireProcurementForMaterial(input.materialId);
  if (!gate.ok) return fail(gate.error);
  const admin = createAdminClient();
  const res = await findOrCreateBrand(admin, {
    materialId: input.materialId,
    businessUnit: gate.businessUnit,
    name: input.name,
    userId: gate.userId,
    producer: input.producer,
    country: input.country,
  });
  if (!res.ok) return fail(res.error);
  if (res.created) {
    const name = cleanBrandName(input.name);
    await logBrandChange(admin, {
      materialId: input.materialId,
      businessUnit: gate.businessUnit,
      materialName: await materialName(admin, input.materialId),
      brandName: name,
      changes: { terdaftar: { from: null, to: "baru" } },
      sensitive: false,
      userId: gate.userId,
      action: "update",
    });
  }
  revalidateAll();
  return { ok: true, data: { id: res.id, existed: !res.created } };
}

export interface UpdateBrandInput {
  id: string;
  name?: string;
  producer?: string | null;
  country?: string | null;
  halalStatus?: HalalStatus;
  halalIssuer?: string | null;
  halalCertNo?: string | null;
  /** YYYY-MM-DD atau null. */
  halalValidUntil?: string | null;
  halalNote?: string | null;
}

const clip = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? "").trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
};

/** Lengkapi/ubah data merek (produsen, negara, halal). Perubahan status/nomor/masa berlaku tercatat sensitif untuk owner. */
export async function updateBrand(input: UpdateBrandInput): Promise<ActionResult> {
  const g = await loadBrandWithGate(input.id);
  if (!g.ok) return fail(g.error);
  const { admin, row, gate } = g;
  const patch: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  let sensitive = false;
  const set = (col: string, label: string, next: unknown, isSensitive = false) => {
    const prev = (row[col] as unknown) ?? null;
    if ((prev ?? null) === (next ?? null)) return;
    patch[col] = next;
    changes[label] = { from: prev, to: next };
    if (isSensitive) sensitive = true;
  };
  if (input.name !== undefined) {
    const nm = cleanBrandName(input.name);
    const bad = brandNameError(nm);
    if (bad) return fail(bad);
    set("name", "nama", nm);
  }
  if (input.producer !== undefined) set("producer", "produsen", clip(input.producer, 120));
  if (input.country !== undefined) set("country", "negara", clip(input.country, 60));
  if (input.halalStatus !== undefined) {
    if (!(HALAL_STATUSES as readonly string[]).includes(input.halalStatus)) return fail("Status halal tidak dikenal");
    set("halal_status", "status halal", input.halalStatus, true);
  }
  if (input.halalIssuer !== undefined) set("halal_issuer", "lembaga penerbit", clip(input.halalIssuer, 120));
  if (input.halalCertNo !== undefined) set("halal_cert_no", "nomor sertifikat", clip(input.halalCertNo, 80), true);
  if (input.halalValidUntil !== undefined) {
    const v = input.halalValidUntil;
    if (v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fail("Masa berlaku harus berupa tanggal");
    set("halal_valid_until", "masa berlaku", v, true);
  }
  if (input.halalNote !== undefined) set("halal_note", "keterangan halal", clip(input.halalNote, 300));
  if (Object.keys(patch).length === 0) return { ok: true };
  const { error } = await admin
    .from("costing_material_brands" as never)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", input.id);
  if (error) {
    if (error.code === "23505") return fail("Merek dengan nama itu sudah ada untuk bahan ini");
    return fail(error.message);
  }
  await logBrandChange(admin, {
    materialId: row.material_id as string,
    businessUnit: gate.businessUnit,
    materialName: await materialName(admin, row.material_id as string),
    brandName: (patch.name as string | undefined) ?? (row.name as string),
    changes,
    sensitive,
    userId: gate.userId,
    action: "update",
  });
  revalidateAll();
  return { ok: true };
}

/** Nonaktifkan merek yang tidak dipakai lagi (tidak dihapus: nota lama dan ekspor periode lalu tetap membacanya). */
export async function setBrandActive(input: { id: string; active: boolean }): Promise<ActionResult> {
  const g = await loadBrandWithGate(input.id);
  if (!g.ok) return fail(g.error);
  const { admin, row, gate } = g;
  if (!input.active) {
    const cur = await currentBrandOf(admin, row.material_id as string);
    if (cur === input.id) return fail("Merek ini sedang dipakai — pilih merek lain sebagai yang dipakai dulu");
  }
  const { error } = await admin.from("costing_material_brands" as never).update({ is_active: input.active, updated_at: new Date().toISOString() } as never).eq("id", input.id);
  if (error) return fail(error.message);
  await logBrandChange(admin, {
    materialId: row.material_id as string,
    businessUnit: gate.businessUnit,
    materialName: await materialName(admin, row.material_id as string),
    brandName: row.name as string,
    changes: { aktif: { from: !input.active, to: input.active } },
    sensitive: false,
    userId: gate.userId,
    action: "update",
  });
  revalidateAll();
  return { ok: true };
}

/** "Ganti merek dipakai": tandai merek yang sedang dipakai untuk bahan ini mulai tanggal tertentu (bawaan hari ini). */
export async function setActiveBrand(input: { materialId: string; brandId: string; startedOn?: string }): Promise<ActionResult> {
  const gate = await requireProcurementForMaterial(input.materialId);
  if (!gate.ok) return fail(gate.error);
  const admin = createAdminClient();
  const { data: brand } = await admin.from("costing_material_brands" as never).select("id, is_active").eq("id", input.brandId).eq("material_id", input.materialId).maybeSingle();
  if (!brand) return fail("Merek tidak cocok dengan bahan");
  const today = jakartaDateString(new Date());
  const startedOn = input.startedOn ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startedOn) || startedOn > today) return fail("Tanggal mulai tidak valid");
  if (!(brand as { is_active: boolean }).is_active)
    await admin.from("costing_material_brands" as never).update({ is_active: true, updated_at: new Date().toISOString() } as never).eq("id", input.brandId);
  const res = await setActiveBrandManual(admin, { materialId: input.materialId, businessUnit: gate.businessUnit, brandId: input.brandId, startedOn });
  if (!res.ok) return fail(res.error);
  revalidateAll();
  return { ok: true };
}

/** Unggah foto/PDF sertifikat halal satu merek (menggantikan yang lama). */
export async function uploadBrandCertificate(formData: FormData): Promise<ActionResult<{ path: string }>> {
  const brandId = formData.get("brandId");
  const file = formData.get("file");
  if (typeof brandId !== "string" || !brandId) return fail("Merek wajib dipilih");
  if (!(file instanceof File)) return fail("Berkas wajib");
  if (!CERT_TYPES.includes(file.type)) return fail("Berkas harus JPG, PNG, WEBP, atau PDF");
  if (file.size > CERT_MAX) return fail("Berkas maksimal 5 MB");
  const g = await loadBrandWithGate(brandId);
  if (!g.ok) return fail(g.error);
  const { admin, row } = g;
  const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `halal-certs/${brandId}-${Date.now()}.${ext}`;
  const up = await admin.storage.from(CERT_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (up.error) return fail(up.error.message);
  const { error } = await admin.from("costing_material_brands" as never).update({ halal_doc_path: path, updated_at: new Date().toISOString() } as never).eq("id", brandId);
  if (error) {
    await admin.storage.from(CERT_BUCKET).remove([path]);
    return fail(error.message);
  }
  if (row.halal_doc_path) await admin.storage.from(CERT_BUCKET).remove([row.halal_doc_path as string]);
  revalidateAll();
  return { ok: true, data: { path } };
}

/** Tautan sementara (1 jam) untuk melihat sertifikat. */
export async function getBrandCertificateUrl(brandId: string): Promise<ActionResult<{ url: string }>> {
  const g = await loadBrandWithGate(brandId);
  if (!g.ok) return fail(g.error);
  const path = g.row.halal_doc_path as string | null;
  if (!path) return fail("Belum ada berkas sertifikat");
  const { data } = await g.admin.storage.from(CERT_BUCKET).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return fail("Gagal membuat tautan");
  return { ok: true, data: { url: data.signedUrl } };
}

/** Jenis bahan (baku/tambahan/penolong) dan apakah bahan masuk Daftar Halal. */
export async function setMaterialHalal(input: { materialId: string; halalKind?: HalalKind | null; inHalalList?: boolean }): Promise<ActionResult> {
  const gate = await requireProcurementForMaterial(input.materialId);
  if (!gate.ok) return fail(gate.error);
  const patch: Record<string, unknown> = {};
  if (input.halalKind !== undefined) {
    if (input.halalKind !== null && !(HALAL_KINDS as readonly string[]).includes(input.halalKind)) return fail("Jenis bahan tidak dikenal");
    patch.halal_kind = input.halalKind;
  }
  if (input.inHalalList !== undefined) patch.in_halal_list = input.inHalalList;
  if (Object.keys(patch).length === 0) return { ok: true };
  const { error } = await createAdminClient().from("costing_materials" as never).update(patch as never).eq("id", input.materialId);
  if (error) return fail(error.message);
  revalidateAll();
  return { ok: true };
}

export interface BrandSummary {
  currentBrand: string | null;
  brandCount: number;
  halalKind: HalalKind | null;
  inHalalList: boolean;
}

/** Ringkasan merek per bahan satu cabang (untuk tab Stok): merek yang sedang dipakai dan jumlah merek aktif. */
export async function getBrandSummaries(businessUnit: string): Promise<ActionResult<Record<string, BrandSummary>>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return fail(gate.error);
  const admin = createAdminClient();
  const [{ data: mats }, { data: brands }, { data: usage }] = await Promise.all([
    admin.from("costing_materials" as never).select("id, halal_kind, in_halal_list").eq("business_unit", businessUnit),
    admin.from("costing_material_brands" as never).select("id, material_id, name").eq("business_unit", businessUnit).eq("is_active", true),
    admin.from("costing_material_brand_usage" as never).select("material_id, brand_id").eq("business_unit", businessUnit).is("ended_on", null),
  ]);
  const nameById = new Map(((brands ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const count = new Map<string, number>();
  for (const b of (brands ?? []) as { material_id: string }[]) count.set(b.material_id, (count.get(b.material_id) ?? 0) + 1);
  const cur = new Map(((usage ?? []) as { material_id: string; brand_id: string }[]).map((u) => [u.material_id, u.brand_id]));
  const out: Record<string, BrandSummary> = {};
  for (const m of (mats ?? []) as { id: string; halal_kind: HalalKind | null; in_halal_list: boolean }[]) {
    out[m.id] = {
      currentBrand: nameById.get(cur.get(m.id) ?? "") ?? null,
      brandCount: count.get(m.id) ?? 0,
      halalKind: m.halal_kind ?? null,
      inHalalList: m.in_halal_list !== false,
    };
  }
  return { ok: true, data: out };
}

export interface BrandQueueItem {
  materialId: string;
  materialName: string;
  category: string | null;
  /** null = bahan ini belum punya merek terdaftar padahal sudah pernah dibeli. */
  brand: { id: string; name: string } | null;
  missing: string[];
  expiry: "habis" | "segera" | null;
}

/** Barang masuk satu cabang, dibaca per halaman 1000 baris (batas baris PostgREST) sampai habis. */
async function allReceipts(admin: Admin, businessUnit: string): Promise<{ material_id: string; total_paid: number | string | null; receipt_date: string }[]> {
  const out: { material_id: string; total_paid: number | string | null; receipt_date: string }[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await admin
      .from("costing_material_receipts" as never)
      .select("material_id, total_paid, receipt_date")
      .eq("business_unit", businessUnit)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    const rows = (data ?? []) as { material_id: string; total_paid: number | string | null; receipt_date: string }[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * Antrean "Perlu dilengkapi": merek berdata halal kurang, sertifikat habis/hampir habis, dan bahan yang dibeli tanpa
 * merek terdaftar. Hanya bahan yang masuk Daftar Halal; urut menurut nilai belanja 90 hari terakhir (paling banyak dibeli
 * dulu) — ukuran murah yang tidak memuat ulang perhitungan pemakaian resep di setiap buka tab Bahan.
 */
export async function listBrandsNeedingInfo(businessUnit: string): Promise<ActionResult<{ items: BrandQueueItem[]; total: number }>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return fail(gate.error);
  const admin = createAdminClient();
  const today = jakartaDateString(new Date());
  const [{ data: mats }, { data: brands }, recs] = await Promise.all([
    admin.from("costing_materials" as never).select("id, name, category").eq("business_unit", businessUnit).eq("is_active", true).eq("in_halal_list", true),
    admin.from("costing_material_brands" as never).select("*").eq("business_unit", businessUnit).eq("is_active", true),
    allReceipts(admin, businessUnit),
  ]);
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 90);
  const sinceIso = since.toISOString().slice(0, 10);
  const spend = new Map<string, number>();
  const bought = new Set<string>();
  for (const r of recs) {
    bought.add(r.material_id);
    if (r.receipt_date >= sinceIso) spend.set(r.material_id, (spend.get(r.material_id) ?? 0) + Number(r.total_paid ?? 0));
  }
  const cost = (id: string) => spend.get(id) ?? 0;
  const byMaterial = new Map<string, Record<string, unknown>[]>();
  for (const b of (brands ?? []) as Record<string, unknown>[]) {
    const arr = byMaterial.get(b.material_id as string) ?? [];
    arr.push(b);
    byMaterial.set(b.material_id as string, arr);
  }
  const items: BrandQueueItem[] = [];
  for (const m of (mats ?? []) as { id: string; name: string; category: string | null }[]) {
    const bs = byMaterial.get(m.id) ?? [];
    if (bs.length === 0) {
      if (bought.has(m.id)) items.push({ materialId: m.id, materialName: m.name, category: m.category, brand: null, missing: ["merek"], expiry: null });
      continue;
    }
    for (const b of bs) {
      const v = toView(b, null, today);
      if (v.missing.length === 0 && !v.expiry) continue;
      items.push({ materialId: m.id, materialName: m.name, category: m.category, brand: { id: v.id, name: v.name }, missing: v.missing, expiry: v.expiry });
    }
  }
  items.sort((a, b) => cost(b.materialId) - cost(a.materialId) || a.materialName.localeCompare(b.materialName, "id"));
  return { ok: true, data: { items: items.slice(0, 200), total: items.length } };
}

export interface HalalProfile {
  businessUnit: string;
  businessName: string | null;
  place: string | null;
  ownerName: string | null;
  halalSupervisorName: string | null;
}

export async function getHalalProfile(businessUnit: string): Promise<ActionResult<HalalProfile>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return fail(gate.error);
  const { data } = await createAdminClient().from("procurement_halal_profiles" as never).select("*").eq("business_unit", businessUnit).maybeSingle();
  const r = data as Record<string, unknown> | null;
  return {
    ok: true,
    data: {
      businessUnit,
      businessName: (r?.business_name as string | null) ?? null,
      place: (r?.place as string | null) ?? null,
      ownerName: (r?.owner_name as string | null) ?? null,
      halalSupervisorName: (r?.halal_supervisor_name as string | null) ?? null,
    },
  };
}

/** Kop dokumen Daftar Bahan Halal per cabang: hanya admin. */
export async function saveHalalProfile(input: HalalProfile): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return fail(gate.error);
  const { error } = await createAdminClient()
    .from("procurement_halal_profiles" as never)
    .upsert(
      {
        business_unit: input.businessUnit,
        business_name: clip(input.businessName, 120),
        place: clip(input.place, 80),
        owner_name: clip(input.ownerName, 120),
        halal_supervisor_name: clip(input.halalSupervisorName, 120),
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "business_unit" }
    );
  if (error) return fail(error.message);
  return { ok: true };
}
