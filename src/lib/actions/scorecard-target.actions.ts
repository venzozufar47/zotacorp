"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin, type ActionResult } from "./_gates";

const validAmount = (n: number | null) => n === null || (Number.isInteger(n) && n > 0 && n <= 100_000_000_000);

/** Target omzet bulanan Scorecard Cabang, POS dan Custom Cake terpisah. `null` = hapus target komponen itu. */
export async function saveBranchOmzetTargets(branch: string, targets: { pos: number | null; cake: number | null }): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (branch !== "Pare" && branch !== "Semarang") return { ok: false, error: "Cabang tidak valid" };
  if (!validAmount(targets.pos) || !validAmount(targets.cake)) {
    return { ok: false, error: "Target harus bilangan bulat rupiah lebih dari 0" };
  }
  const { error } = await createAdminClient()
    .from("scorecard_branch_targets" as never)
    .upsert(
      { branch, monthly_pos_target: targets.pos, monthly_cake_target: targets.cake, updated_by: gate.userId, updated_at: new Date().toISOString() } as never,
      { onConflict: "branch" }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/scorecard");
  revalidatePath("/dashboard");
  return { ok: true };
}
