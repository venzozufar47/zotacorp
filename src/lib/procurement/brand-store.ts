/**
 * Penyimpanan merek bahan (sisi server): dipakai bersama oleh aksi nota belanja, barang masuk, dan pengelolaan merek.
 * BUKAN berkas "use server" supaya fungsi di sini tidak terbuka sebagai endpoint publik; pemanggil wajib sudah lolos gate
 * pengadaan untuk bahan/cabang yang bersangkutan.
 */

import type { createAdminClient } from "@/lib/actions/_supabase-admin";

type Admin = ReturnType<typeof createAdminClient>;

export const BRAND_NAME_MAX = 80;

/** Rapikan nama merek: spasi ganda → satu. */
export function cleanBrandName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Pesan galat untuk nama merek yang tidak sah, atau null bila boleh. */
export function brandNameError(name: string): string | null {
  if (name.length < 1) return "Nama merek wajib diisi";
  if (name.length > BRAND_NAME_MAX) return `Nama merek maksimal ${BRAND_NAME_MAX} huruf`;
  return null;
}

/** `%` dan `_` pada nama bukan wildcard (pola `proposeMaterial`). */
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Merek dengan nama itu pada bahan ini (tanpa membedakan huruf besar/kecil); dibuat bila belum ada. Merek nonaktif yang
 * namanya sama diaktifkan kembali: membeli lagi berarti dipakai lagi.
 */
export async function findOrCreateBrand(
  admin: Admin,
  input: { materialId: string; businessUnit: string; name: string; userId: string; producer?: string | null; country?: string | null }
): Promise<{ ok: true; id: string; created: boolean } | { ok: false; error: string }> {
  const name = cleanBrandName(input.name);
  const bad = brandNameError(name);
  if (bad) return { ok: false, error: bad };
  const { data: dup } = await admin
    .from("costing_material_brands" as never)
    .select("id, is_active")
    .eq("material_id", input.materialId)
    .ilike("name", likeEscape(name))
    .maybeSingle();
  if (dup) {
    const d = dup as { id: string; is_active: boolean };
    if (!d.is_active) await admin.from("costing_material_brands" as never).update({ is_active: true, updated_at: new Date().toISOString() } as never).eq("id", d.id);
    return { ok: true, id: d.id, created: false };
  }
  const { data, error } = await admin
    .from("costing_material_brands" as never)
    .insert({
      material_id: input.materialId,
      business_unit: input.businessUnit,
      name,
      producer: input.producer?.trim() || null,
      country: input.country?.trim() || null,
      created_by: input.userId,
    } as never)
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal menyimpan merek" };
  return { ok: true, id: (data as { id: string }).id, created: true };
}

/** Merek milik bahan ini dan masih aktif (dipakai memvalidasi pilihan klien). */
export async function brandBelongsToMaterial(admin: Admin, brandId: string, materialId: string): Promise<boolean> {
  const { data } = await admin
    .from("costing_material_brands" as never)
    .select("id")
    .eq("id", brandId)
    .eq("material_id", materialId)
    .maybeSingle();
  return !!data;
}

interface Segment {
  brand_id: string;
  started_on: string;
  ended_on: string | null;
}

/**
 * Susun ulang riwayat merek "otomatis" satu bahan dari barang masuk bermerek: tiap pergantian merek menutup merek lama di
 * tanggal merek baru masuk. Baris `manual` (ketukan petugas) dipertahankan dan menang atas riwayat otomatis yang
 * tumpang tindih. Dipanggil setelah nota dibuat/diubah/dihapus dan setelah barang masuk berubah, jadi riwayat selalu
 * mengikuti barang masuk yang tersisa.
 */
export async function rebuildBrandUsage(admin: Admin, materialId: string): Promise<void> {
  const [{ data: mat }, { data: recs }, { data: existing }] = await Promise.all([
    admin.from("costing_materials" as never).select("business_unit").eq("id", materialId).maybeSingle(),
    admin
      .from("costing_material_receipts" as never)
      .select("brand_id, receipt_date, created_at")
      .eq("material_id", materialId)
      .not("brand_id", "is", null)
      .order("receipt_date", { ascending: true })
      .order("created_at", { ascending: true }),
    admin.from("costing_material_brand_usage" as never).select("id, brand_id, started_on, ended_on, source").eq("material_id", materialId),
  ]);
  const businessUnit = (mat as { business_unit?: string } | null)?.business_unit;
  if (!businessUnit) return;

  const segs: Segment[] = [];
  for (const r of (recs ?? []) as { brand_id: string; receipt_date: string }[]) {
    const last = segs[segs.length - 1];
    if (last && last.brand_id === r.brand_id) continue;
    if (last) last.ended_on = r.receipt_date;
    segs.push({ brand_id: r.brand_id, started_on: r.receipt_date, ended_on: null });
  }

  const rows = (existing ?? []) as { id: string; brand_id: string; started_on: string; ended_on: string | null; source: string }[];
  const manualOpen = rows.find((r) => r.source === "manual" && r.ended_on == null) ?? null;
  const autoIds = rows.filter((r) => r.source === "auto").map((r) => r.id);
  if (autoIds.length) await admin.from("costing_material_brand_usage" as never).delete().in("id", autoIds);

  const inserts: Record<string, unknown>[] = [];
  for (const s of segs) {
    let ended = s.ended_on;
    if (manualOpen && (ended == null || ended > manualOpen.started_on)) {
      // Pilihan manual yang sedang berjalan menggantikan riwayat otomatis sejak tanggal mulainya.
      if (s.started_on >= manualOpen.started_on) continue;
      ended = manualOpen.started_on;
    }
    inserts.push({ material_id: materialId, brand_id: s.brand_id, business_unit: businessUnit, started_on: s.started_on, ended_on: ended, source: "auto" });
  }
  if (inserts.length) await admin.from("costing_material_brand_usage" as never).insert(inserts as never);
}

/**
 * Pilihan manual "Ganti merek dipakai": tutup merek yang sedang dipakai pada `startedOn` lalu buka merek pilihan.
 * Tanpa perubahan bila merek itu memang sudah dipakai.
 */
export async function setActiveBrandManual(
  admin: Admin,
  input: { materialId: string; businessUnit: string; brandId: string; startedOn: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: open } = await admin
    .from("costing_material_brand_usage" as never)
    .select("id, brand_id, started_on")
    .eq("material_id", input.materialId)
    .is("ended_on", null)
    .maybeSingle();
  const cur = open as { id: string; brand_id: string; started_on: string } | null;
  if (cur?.brand_id === input.brandId) return { ok: true };
  if (cur) {
    // Tanggal mulai tidak boleh lebih awal dari mulai merek yang sedang ditutup.
    const endOn = input.startedOn < cur.started_on ? cur.started_on : input.startedOn;
    const { error } = await admin.from("costing_material_brand_usage" as never).update({ ended_on: endOn } as never).eq("id", cur.id);
    if (error) return { ok: false, error: error.message };
  }
  const { error } = await admin.from("costing_material_brand_usage" as never).insert({
    material_id: input.materialId,
    brand_id: input.brandId,
    business_unit: input.businessUnit,
    started_on: cur && input.startedOn < cur.started_on ? cur.started_on : input.startedOn,
    source: "manual",
  } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Rangkuman status kelengkapan data halal satu merek untuk antrean "Perlu dilengkapi". */
export interface BrandHalalFields {
  halal_status: string;
  producer: string | null;
  country: string | null;
  halal_issuer: string | null;
  halal_cert_no: string | null;
  halal_valid_until: string | null;
}

/** Hal yang masih kurang (kosong = lengkap). `tidak_wajib` cukup produsen/negara tidak diwajibkan. */
export function brandMissing(b: BrandHalalFields): string[] {
  if (b.halal_status === "belum_dicek") return ["status halal"];
  if (b.halal_status === "tidak_wajib") return [];
  const out: string[] = [];
  if (!b.producer) out.push("produsen");
  if (!b.country) out.push("negara");
  if (!b.halal_issuer) out.push("lembaga penerbit");
  if (!b.halal_cert_no) out.push("nomor sertifikat");
  if (!b.halal_valid_until) out.push("masa berlaku");
  return out;
}

/** Sertifikat: "habis" (sudah lewat), "segera" (≤ 60 hari), atau null. */
export function certExpiry(validUntil: string | null, today: string): "habis" | "segera" | null {
  if (!validUntil) return null;
  if (validUntil < today) return "habis";
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 60);
  return validUntil <= limit.toISOString().slice(0, 10) ? "segera" : null;
}

/** "Jenis Bahan" bawaan dari kategori: hanya yang jelas; kemasan/perlengkapan dibiarkan kosong (keputusan penyelia halal). */
export function defaultHalalKind(category: string | null): "baku" | "tambahan" | null {
  if (!category) return null;
  if (category === "Pengembang, Perisa & Garam") return "tambahan";
  if (category === "Kemasan & Label" || category === "Perlengkapan Saji") return null;
  return "baku";
}
