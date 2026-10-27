"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";

/** Target omzet bulanan Scorecard Cabang (POS + Custom Cake). `null` = hapus target (kartu jadi "Target belum diatur"). */
export async function saveBranchOmzetTarget(branch: string, amount: number | null): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (branch !== "Pare" && branch !== "Semarang") return { ok: false, error: "Cabang tidak valid" };
  if (amount !== null && (!Number.isInteger(amount) || amount <= 0 || amount > 100_000_000_000)) {
    return { ok: false, error: "Target harus bilangan bulat rupiah lebih dari 0" };
  }
  const { error } = await createAdminClient()
    .from("scorecard_branch_targets" as never)
    .upsert({ branch, monthly_omzet_target: amount, updated_by: gate.userId, updated_at: new Date().toISOString() } as never, { onConflict: "branch" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/scorecard");
  revalidatePath("/dashboard");
  return { ok: true };
}
