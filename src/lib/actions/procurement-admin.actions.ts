"use server";

/**
 * Aksi Pengadaan khusus SUPERADMIN: penugasan staf, setelan global, dan
 * override kebijakan per bahan.
 *
 * File terpisah dari procurement.actions.ts supaya `requireAdmin()` di
 * baris pertama tiap export tak bisa terlewat, dan supaya tidak ada aksi
 * yang bisa dijangkau staf tersesat ke dalamnya.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { num } from "@/lib/costing/rows";
import {
  fetchProcurementSettings,
  mapSettings,
} from "@/lib/procurement/rows";
import {
  SERVICE_LEVEL_MIN,
  SERVICE_LEVEL_MAX,
  type ProcurementSettingsLite,
} from "@/lib/procurement/calc";

function revalidateProcurement() {
  revalidatePath("/pengadaan", "layout");
  revalidatePath("/admin/costing", "layout");
}

export interface ProcurementStaffRow {
  userId: string;
  fullName: string;
  position: string | null;
  avatarUrl: string | null;
  businessUnits: string[];
}

export interface EligibleProfileRow {
  id: string;
  fullName: string;
  position: string | null;
  avatarUrl: string | null;
}

export async function getProcurementSettings(): Promise<
  ActionResult<ProcurementSettingsLite>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  return { ok: true, data: await fetchProcurementSettings(adminClient()) };
}

export async function updateProcurementSettings(input: {
  serviceLevel?: number;
  orderingCost?: number;
  holdingRateAnnual?: number;
  reviewPeriodDays?: number;
  usageCv?: number;
}): Promise<ActionResult<ProcurementSettingsLite>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const patch: Record<string, unknown> = { updated_by: gate.userId };
  if (input.serviceLevel !== undefined) {
    if (
      !Number.isFinite(input.serviceLevel) ||
      input.serviceLevel < SERVICE_LEVEL_MIN ||
      input.serviceLevel > SERVICE_LEVEL_MAX
    )
      return {
        ok: false,
        error: `Service level harus antara ${SERVICE_LEVEL_MIN * 100}% dan ${SERVICE_LEVEL_MAX * 100}%`,
      };
    patch.service_level = input.serviceLevel;
  }
  const nonNeg = (v: number | undefined, key: string, label: string) => {
    if (v === undefined) return null;
    if (!Number.isFinite(v) || v < 0) return `${label} tidak valid`;
    patch[key] = v;
    return null;
  };
  const err =
    nonNeg(input.orderingCost, "ordering_cost", "Biaya pesan") ??
    nonNeg(input.holdingRateAnnual, "holding_rate_annual", "Biaya simpan") ??
    nonNeg(input.usageCv, "usage_cv", "Asumsi variasi");
  if (err) return { ok: false, error: err };
  if (input.reviewPeriodDays !== undefined) {
    if (!Number.isInteger(input.reviewPeriodDays) || input.reviewPeriodDays <= 0)
      return { ok: false, error: "Periode review harus bilangan bulat > 0" };
    patch.review_period_days = input.reviewPeriodDays;
  }

  const supabase = adminClient();
  const { data: existing } = await supabase
    .from("procurement_settings" as never)
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!existing)
    return { ok: false, error: "Baris setelan tidak ditemukan" };

  const { data, error } = await supabase
    .from("procurement_settings" as never)
    .update(patch as never)
    .eq("id", (existing as { id: string }).id)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Gagal" };
  revalidateProcurement();
  return { ok: true, data: mapSettings(data as Record<string, unknown>) };
}

/** Override service level satu bahan. Hak superadmin — staf read-only. */
export async function updateMaterialServiceLevel(input: {
  materialId: string;
  serviceLevel: number | null;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (
    input.serviceLevel != null &&
    (!Number.isFinite(input.serviceLevel) ||
      input.serviceLevel <= 0 ||
      input.serviceLevel >= 1)
  )
    return { ok: false, error: "Service level harus antara 0 dan 1" };

  const supabase = adminClient();
  const { data: mat } = await supabase
    .from("costing_materials" as never)
    .select("business_unit")
    .eq("id", input.materialId)
    .maybeSingle();
  const bu = (mat as { business_unit?: string } | null)?.business_unit;
  if (!bu) return { ok: false, error: "Bahan tidak ditemukan" };

  const { error } = await supabase
    .from("costing_material_procurement" as never)
    .upsert(
      {
        material_id: input.materialId,
        business_unit: bu,
        service_level_override: input.serviceLevel,
        updated_by: gate.userId,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "material_id" }
    );
  if (error) return { ok: false, error: error.message };
  revalidateProcurement();
  return { ok: true };
}

export async function listProcurementAssignments(): Promise<
  ActionResult<ProcurementStaffRow[]>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("procurement_assignments" as never)
    .select("user_id, business_unit")
    .order("business_unit");
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as Record<string, unknown>[];
  const byUser = new Map<string, string[]>();
  for (const r of rows) {
    const uid = r.user_id as string;
    const arr = byUser.get(uid) ?? [];
    arr.push(r.business_unit as string);
    byUser.set(uid, arr);
  }
  if (byUser.size === 0) return { ok: true, data: [] };
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, full_name, position, avatar_url")
    .in("id", Array.from(byUser.keys()));
  const profById = new Map(
    ((profs ?? []) as Record<string, unknown>[]).map((p) => [p.id as string, p])
  );
  return {
    ok: true,
    data: Array.from(byUser.entries())
      .map(([userId, businessUnits]) => {
        const p = profById.get(userId);
        return {
          userId,
          fullName: (p?.full_name as string | null) ?? "(tanpa nama)",
          position: (p?.position as string | null) || null,
          avatarUrl: (p?.avatar_url as string | null) ?? null,
          businessUnits: businessUnits.sort((a, b) => a.localeCompare(b, "id")),
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "id")),
  };
}

/** Kandidat: karyawan aktif non-investor. Pola listEligibleProfiles di
 *  yeobo-booth-admins.actions.ts. */
export async function listEligibleProfiles(): Promise<
  ActionResult<EligibleProfileRow[]>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { data, error } = await adminClient()
    .from("profiles")
    .select("id, full_name, position, avatar_url")
    .neq("role", "investor")
    .eq("is_active", true)
    .order("full_name");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: ((data ?? []) as Record<string, unknown>[]).map((p) => ({
      id: p.id as string,
      fullName: (p.full_name as string | null) ?? "(tanpa nama)",
      position: (p.position as string | null) || null,
      avatarUrl: (p.avatar_url as string | null) ?? null,
    })),
  };
}

/**
 * Ganti SELURUH himpunan unit bisnis untuk satu karyawan (diff add/remove
 * dalam satu aksi). Daftar kosong = cabut semua penugasannya.
 */
export async function setProcurementAssignments(input: {
  userId: string;
  businessUnits: string[];
}): Promise<ActionResult<{ added: number; removed: number }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.userId) return { ok: false, error: "Karyawan wajib dipilih" };

  const next = new Set(
    (input.businessUnits ?? []).map((b) => b.trim()).filter(Boolean)
  );
  const supabase = adminClient();
  const { data: cur } = await supabase
    .from("procurement_assignments" as never)
    .select("business_unit")
    .eq("user_id", input.userId);
  const existing = new Set(
    ((cur ?? []) as Record<string, unknown>[]).map(
      (r) => r.business_unit as string
    )
  );

  const toAdd = Array.from(next).filter((b) => !existing.has(b));
  const toRemove = Array.from(existing).filter((b) => !next.has(b));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("procurement_assignments" as never)
      .insert(
        toAdd.map((bu) => ({
          user_id: input.userId,
          business_unit: bu,
          assigned_by: gate.userId,
        })) as never
      );
    if (error) return { ok: false, error: error.message };
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("procurement_assignments" as never)
      .delete()
      .eq("user_id", input.userId)
      .in("business_unit", toRemove);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/admin/costing", "layout");
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: { added: toAdd.length, removed: toRemove.length } };
}

/** Ringkasan pemakaian untuk kartu admin (berapa bahan dipantau per BU). */
export async function countTrackedMaterials(): Promise<
  ActionResult<Record<string, number>>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { data, error } = await adminClient()
    .from("costing_material_procurement" as never)
    .select("business_unit, is_tracked");
  if (error) return { ok: false, error: error.message };
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    if (!(r.is_tracked as boolean)) continue;
    const bu = r.business_unit as string;
    out[bu] = (out[bu] ?? 0) + num(1);
  }
  return { ok: true, data: out };
}
