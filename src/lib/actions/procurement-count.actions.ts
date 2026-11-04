"use server";

import { createAdminClient } from "./_supabase-admin";
import { requireProcurementForBu, type ActionResult } from "./_gates";
import { computeCountPlan, type CountPlan } from "@/lib/procurement/count-plan";
import { offWorkdayUserIds } from "@/lib/procurement/workday";

/** Daftar "Opname hari ini" cabang ini untuk petugas pengadaan (atau owner). enabled=false = cabang belum memakai ritme harian. */
export async function getTodayCountPlan(businessUnit: string): Promise<ActionResult<CountPlan>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const admin = createAdminClient();
    // Di luar hari kerja petugas, opname dimatikan: tanpa daftar, tanpa banner (owner tidak dibatasi).
    if (!gate.isAdmin && (await offWorkdayUserIds(admin, [gate.userId])).has(gate.userId)) {
      return { ok: true, data: { enabled: false, items: [], doneCount: 0, total: 0, minutesLeft: 0, offDay: true, phase: 2, onboarding: { counted: 0, total: 0 } } };
    }
    return { ok: true, data: await computeCountPlan(admin, businessUnit) };
  } catch {
    return { ok: false, error: "Gagal menyusun daftar opname" };
  }
}
