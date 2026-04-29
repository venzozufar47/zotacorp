"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/supabase/cached";
import type { Database } from "@/lib/supabase/types";

export type ExtraWorkFormula = "fixed" | "custom" | "daily_multiplier";

export interface ExtraWorkKindRow {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  formulaKind: ExtraWorkFormula;
  fixedRateIdr: number;
  dailyMultiplier: number;
  /** User IDs yang punya akses ke kind ini. Empty = tidak ada
   *  (admin belum assign). */
  assignedUserIds: string[];
}

async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  return { ok: true };
}

export async function listExtraWorkKinds(): Promise<ExtraWorkKindRow[]> {
  const supabase = await createClient();
  const { data: kinds, error } = await supabase
    .from("extra_work_kinds")
    .select(
      "id, name, sort_order, active, formula_kind, fixed_rate_idr, daily_multiplier"
    )
    .order("sort_order")
    .order("name");
  if (error || !kinds) return [];
  const ids = kinds.map((k) => k.id);
  const { data: assignments } =
    ids.length > 0
      ? await supabase
          .from("extra_work_kind_assignments")
          .select("kind_id, user_id")
          .in("kind_id", ids)
      : { data: [] };
  const byKind = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const arr = byKind.get(a.kind_id) ?? [];
    arr.push(a.user_id);
    byKind.set(a.kind_id, arr);
  }
  return kinds.map((k) => ({
    id: k.id,
    name: k.name,
    sortOrder: k.sort_order,
    active: k.active,
    formulaKind: k.formula_kind as ExtraWorkFormula,
    fixedRateIdr: Number(k.fixed_rate_idr),
    dailyMultiplier: Number(k.daily_multiplier),
    assignedUserIds: byKind.get(k.id) ?? [],
  }));
}

/** Untuk dashboard karyawan: kind aktif yang assigned ke user
 *  bersangkutan saja. */
export async function listExtraWorkKindsForUser(
  userId: string
): Promise<ExtraWorkKindRow[]> {
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("extra_work_kind_assignments")
    .select("kind_id")
    .eq("user_id", userId);
  const kindIds = (assignments ?? []).map((a) => a.kind_id);
  if (kindIds.length === 0) return [];
  const { data: kinds } = await supabase
    .from("extra_work_kinds")
    .select(
      "id, name, sort_order, active, formula_kind, fixed_rate_idr, daily_multiplier"
    )
    .in("id", kindIds)
    .eq("active", true)
    .order("sort_order")
    .order("name");
  return (kinds ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    sortOrder: k.sort_order,
    active: k.active,
    formulaKind: k.formula_kind as ExtraWorkFormula,
    fixedRateIdr: Number(k.fixed_rate_idr),
    dailyMultiplier: Number(k.daily_multiplier),
    assignedUserIds: [],
  }));
}

export async function createExtraWorkKind(input: {
  name: string;
  formulaKind: ExtraWorkFormula;
  fixedRateIdr?: number;
  dailyMultiplier?: number;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const name = input.name.trim();
  if (!name) return { error: "Nama wajib diisi" };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("extra_work_kinds")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (existing?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("extra_work_kinds").insert({
    name,
    sort_order: nextSort,
    formula_kind: input.formulaKind,
    fixed_rate_idr: input.fixedRateIdr ?? 0,
    daily_multiplier: input.dailyMultiplier ?? 0,
  });
  if (error) {
    if (error.code === "23505") return { error: `"${name}" sudah ada` };
    return { error: error.message };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function updateExtraWorkKind(input: {
  id: string;
  name?: string;
  formulaKind?: ExtraWorkFormula;
  fixedRateIdr?: number;
  dailyMultiplier?: number;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) return { error: "Nama tidak boleh kosong" };
    patch.name = trimmed;
  }
  if (input.formulaKind !== undefined) patch.formula_kind = input.formulaKind;
  if (input.fixedRateIdr !== undefined)
    patch.fixed_rate_idr = input.fixedRateIdr;
  if (input.dailyMultiplier !== undefined)
    patch.daily_multiplier = input.dailyMultiplier;
  if (Object.keys(patch).length === 0) return { ok: true as const };

  const supabase = await createClient();

  // Sync nama snapshot di extra_work_logs supaya history tetap konsisten.
  if (patch.name !== undefined) {
    const { data: existing } = await supabase
      .from("extra_work_kinds")
      .select("name")
      .eq("id", input.id)
      .single();
    if (existing && existing.name !== patch.name) {
      await supabase
        .from("extra_work_logs")
        .update({ kind: patch.name as string })
        .eq("kind", existing.name);
    }
  }

  const { error } = await supabase
    .from("extra_work_kinds")
    .update(patch as Database["public"]["Tables"]["extra_work_kinds"]["Update"])
    .eq("id", input.id);
  if (error) {
    if (error.code === "23505")
      return { error: `Nama duplikat dengan kind lain` };
    return { error: error.message };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/admin/payslips");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function setExtraWorkKindActive(input: {
  id: string;
  active: boolean;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("extra_work_kinds")
    .update({ active: input.active })
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

export async function deleteExtraWorkKind(input: { id: string }) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("extra_work_kinds")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/**
 * Replace assignment list untuk satu kind. Diff dengan existing supaya
 * tidak nge-flush + re-insert seluruh baris (lebih cepat di hot-path).
 */
export async function setExtraWorkKindAssignees(input: {
  kindId: string;
  userIds: string[];
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();
  const desired = new Set(input.userIds);
  const { data: existing } = await supabase
    .from("extra_work_kind_assignments")
    .select("user_id")
    .eq("kind_id", input.kindId);
  const current = new Set((existing ?? []).map((r) => r.user_id));

  const toAdd = [...desired].filter((u) => !current.has(u));
  const toRemove = [...current].filter((u) => !desired.has(u));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("extra_work_kind_assignments")
      .insert(toAdd.map((user_id) => ({ kind_id: input.kindId, user_id })));
    if (error) return { error: error.message };
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("extra_work_kind_assignments")
      .delete()
      .eq("kind_id", input.kindId)
      .in("user_id", toRemove);
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

/**
 * Per-entry editor: admin update notes / formula override / custom rate
 * pada satu extra_work_logs row dari payslip variables monthly editor.
 */
export async function updateExtraWorkLog(input: {
  id: string;
  notes?: string | null;
  formulaOverride?: ExtraWorkFormula | null;
  customRateIdr?: number | null;
  multiplierOverride?: number | null;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const patch: Record<string, unknown> = {};
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.formulaOverride !== undefined)
    patch.formula_override = input.formulaOverride;
  if (input.customRateIdr !== undefined)
    patch.custom_rate_idr = input.customRateIdr;
  if (input.multiplierOverride !== undefined)
    patch.multiplier_override = input.multiplierOverride;
  if (Object.keys(patch).length === 0) return { ok: true as const };

  const supabase = await createClient();
  const { error } = await supabase
    .from("extra_work_logs")
    .update(patch as Database["public"]["Tables"]["extra_work_logs"]["Update"])
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  revalidatePath("/dashboard");
  return { ok: true as const };
}
