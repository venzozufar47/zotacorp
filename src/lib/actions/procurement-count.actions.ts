"use server";

import { createAdminClient } from "./_supabase-admin";
import { requireProcurementForBu, type ActionResult } from "./_gates";
import { computeCountPlan, type CountPlan } from "@/lib/procurement/count-plan";

/** Daftar "Opname hari ini" cabang ini untuk petugas pengadaan (atau owner). enabled=false = cabang belum memakai ritme harian. */
export async function getTodayCountPlan(businessUnit: string): Promise<ActionResult<CountPlan>> {
  const gate = await requireProcurementForBu(businessUnit);
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    return { ok: true, data: await computeCountPlan(createAdminClient(), businessUnit) };
  } catch {
    return { ok: false, error: "Gagal menyusun daftar opname" };
  }
}
