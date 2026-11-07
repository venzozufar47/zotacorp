"use server";

import { createAdminClient as adminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";
import { loadLeakageReport } from "@/lib/procurement/leakage-load";
import type { LeakageReport } from "@/lib/procurement/leakage";

/** Laporan Kebocoran Bahan satu brand (admin). `rangeDays` null = sejak opname pertama. */
export async function getLeakageReport(
  businessUnit: string,
  rangeDays: number | null
): Promise<ActionResult<LeakageReport>> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!businessUnit) return { ok: false, error: "Brand wajib dipilih" };
  try {
    return {
      ok: true,
      data: await loadLeakageReport(adminClient(), businessUnit, rangeDays),
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Gagal memuat laporan",
    };
  }
}
