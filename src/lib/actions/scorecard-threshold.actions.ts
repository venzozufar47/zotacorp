"use server";

/**
 * Ambang warna Scorecard Cabang untuk Waste dan Service level: dibaca/ditulis owner dari halaman Service Level.
 * Ambang yang disimpan dipakai scorecard di beranda karyawan, halaman Scorecard Cabang, dan perhitungan poin bonus.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { validateThresholds, type BranchThresholds } from "@/lib/scorecard/thresholds";
import { invalidateThresholdsCache, loadThresholds } from "@/lib/scorecard/thresholds-store";

export async function getScorecardThresholds(): Promise<ActionResult<BranchThresholds>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  invalidateThresholdsCache();
  return { ok: true, data: await loadThresholds(createAdminClient()) };
}

export async function saveScorecardThresholds(input: BranchThresholds): Promise<ActionResult<BranchThresholds>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const next: BranchThresholds = {
    wasteGreen: Number(input.wasteGreen),
    wasteYellow: Number(input.wasteYellow),
    slGreen: Number(input.slGreen),
    slYellow: Number(input.slYellow),
  };
  const bad = validateThresholds(next);
  if (bad) return { ok: false, error: bad };
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("branch_scorecard_thresholds" as never)
    .upsert(
      [
        { metric: "waste", green_bound: next.wasteGreen, yellow_bound: next.wasteYellow, updated_by: gate.userId, updated_at: now },
        { metric: "service_level", green_bound: next.slGreen, yellow_bound: next.slYellow, updated_by: gate.userId, updated_at: now },
      ] as never,
      { onConflict: "metric" }
    );
  if (error) return { ok: false, error: error.message };
  invalidateThresholdsCache();
  revalidatePath("/admin/service-level");
  revalidatePath("/admin/scorecard");
  revalidatePath("/dashboard");
  return { ok: true, data: next };
}
