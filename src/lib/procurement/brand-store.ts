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
  if (error?.code === "23505") {
    // Balapan: merek bernama sama baru saja dibuat di permintaan lain → pakai yang itu.
    const { data: again } = await admin.from("costing_material_brands" as never).select("id").eq("material_id", input.materialId).ilike("name", likeEscape(name)).maybeSingle();
    if (again) return { ok: true, id: (again as { id: string }).id, created: false };
  }
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

/** Satu kejadian yang menentukan merek mana yang dipakai: barang masuk bermerek (auto) atau pilihan petugas (manual). */
export interface UsageEvent {
  brandId: string;
  /** YYYY-MM-DD */
  date: string;
  /** Pengurut untuk tanggal yang sama (waktu dibuat). */
  ts: string;
  source: "auto" | "manual";
}

export interface UsageRun {
  brandId: string;
  startedOn: string;
  /** null = sedang dipakai. */
  endedOn: string | null;
  source: "auto" | "manual";
  ts: string;
}

/**
 * Riwayat merek yang dipakai dari kejadian berurutan: yang TERBARU menentukan merek yang dipakai, baik itu barang masuk
 * maupun pilihan manual petugas. Kejadian dengan merek yang sama dengan sebelumnya tidak membuka rentang baru. Murni (tanpa DB).
 */
export function computeUsageRuns(events: readonly UsageEvent[]): UsageRun[] {
  const sorted = [...events].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.ts < y.ts ? -1 : x.ts > y.ts ? 1 : 0));
  const runs: UsageRun[] = [];
  for (const ev of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.brandId === ev.brandId) continue;
    if (last) last.endedOn = ev.date;
    runs.push({ brandId: ev.brandId, startedOn: ev.date, endedOn: null, source: ev.source, ts: ev.ts });
  }
  return runs;
}

/**
 * Susun ulang riwayat merek yang dipakai satu bahan dari barang masuk bermerek DITAMBAH pilihan manual yang tersimpan
 * (baris `manual`). Dipanggil setelah nota dibuat/diubah/dihapus dan barang masuk berubah, jadi riwayat selalu mengikuti
 * data yang tersisa. Pembelian bermerek lain SETELAH pilihan manual otomatis mengambil alih, dan sebaliknya.
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
    admin.from("costing_material_brand_usage" as never).select("id, brand_id, started_on, source, created_at").eq("material_id", materialId),
  ]);
  const businessUnit = (mat as { business_unit?: string } | null)?.business_unit;
  if (!businessUnit) return;

  const events: UsageEvent[] = [];
  for (const r of (recs ?? []) as { brand_id: string; receipt_date: string; created_at: string }[])
    events.push({ brandId: r.brand_id, date: r.receipt_date, ts: r.created_at, source: "auto" });
  const oldRows = (existing ?? []) as { id: string; brand_id: string; started_on: string; source: string; created_at: string }[];
  for (const u of oldRows) if (u.source === "manual") events.push({ brandId: u.brand_id, date: u.started_on, ts: u.created_at, source: "manual" });

  const runs = computeUsageRuns(events);
  // Hapus + isi ulang dalam SATU transaksi (fungsi SQL): gagal di tengah tidak boleh menghilangkan pilihan manual petugas.
  const { error } = await admin.rpc(
    "replace_brand_usage" as never,
    {
      p_material: materialId,
      p_business_unit: businessUnit,
      p_runs: runs.map((r) => ({ brand_id: r.brandId, started_on: r.startedOn, ended_on: r.endedOn, source: r.source, created_at: r.ts })),
    } as never
  );
  if (error) throw new Error(error.message);
}

/**
 * Pilihan manual "Ganti merek dipakai": catat kejadian manual (rentang nol hari) lalu susun ulang riwayat, jadi merek
 * pilihan itu menjadi yang dipakai sampai ada barang masuk bermerek lain. Tanpa perubahan bila merek itu sudah dipakai.
 */
export async function setActiveBrandManual(
  admin: Admin,
  input: { materialId: string; businessUnit: string; brandId: string; startedOn: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: open } = await admin
    .from("costing_material_brand_usage" as never)
    .select("brand_id")
    .eq("material_id", input.materialId)
    .is("ended_on", null)
    .maybeSingle();
  if ((open as { brand_id?: string } | null)?.brand_id === input.brandId) return { ok: true };
  const { error } = await admin.from("costing_material_brand_usage" as never).insert({
    material_id: input.materialId,
    brand_id: input.brandId,
    business_unit: input.businessUnit,
    started_on: input.startedOn,
    ended_on: input.startedOn,
    source: "manual",
  } as never);
  if (error) return { ok: false, error: error.message };
  try {
    await rebuildBrandUsage(admin, input.materialId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Gagal memperbarui riwayat merek" };
  }
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
