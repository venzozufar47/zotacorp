"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient as adminClient } from "./_supabase-admin";
import {
  requireAdmin,
  requireAdminOrInvestorForBu,
  type ActionResult,
} from "./_gates";

export interface PhotoSessionRow {
  id: string;
  branch: string;
  studio: string;
  packageLabel: string;
  periodYear: number;
  periodMonth: number;
  sessions: number;
  sortOrder: number;
}

interface DbRow {
  id: string;
  branch: string;
  studio: string;
  package_label: string;
  period_year: number;
  period_month: number;
  sessions: number;
  sort_order: number;
}

function mapRow(r: DbRow): PhotoSessionRow {
  return {
    id: r.id,
    branch: r.branch,
    studio: r.studio,
    packageLabel: r.package_label,
    periodYear: r.period_year,
    periodMonth: r.period_month,
    sessions: Number(r.sessions),
    sortOrder: r.sort_order,
  };
}

/**
 * Photo-session counts for Yeobo Space. Admin or an investor assigned to
 * Yeobo Space may read. Optionally scoped to one branch.
 */
export async function listYeoboPhotoSessions(
  branch?: string
): Promise<PhotoSessionRow[]> {
  const gate = await requireAdminOrInvestorForBu("Yeobo Space");
  if (!gate.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  let q = supabase.from("yeobo_photo_sessions").select("*");
  if (branch) q = q.eq("branch", branch);
  q = q
    .order("period_year", { ascending: true })
    .order("period_month", { ascending: true })
    .order("sort_order", { ascending: true });
  const { data } = await q;
  return ((data ?? []) as DbRow[]).map(mapRow);
}

/**
 * Admin upsert of one studio/package's session count for a branch-month.
 * sessions = 0 deletes the row (keeps the table lean; absent = 0).
 */
export async function upsertYeoboPhotoSession(input: {
  branch: string;
  studio: string;
  packageLabel: string;
  periodYear: number;
  periodMonth: number;
  sessions: number;
  sortOrder?: number;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const studio = input.studio.trim();
  const pkg = input.packageLabel.trim();
  if (!input.branch || !studio)
    return { ok: false, error: "Cabang & studio wajib" };
  if (input.periodMonth < 1 || input.periodMonth > 12)
    return { ok: false, error: "Bulan tidak valid" };
  if (!Number.isFinite(input.sessions) || input.sessions < 0)
    return { ok: false, error: "Jumlah sesi tidak valid" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = adminClient() as any;
  if (input.sessions === 0) {
    await supabase
      .from("yeobo_photo_sessions")
      .delete()
      .eq("branch", input.branch)
      .eq("studio", studio)
      .eq("package_label", pkg)
      .eq("period_year", input.periodYear)
      .eq("period_month", input.periodMonth);
    revalidatePath("/admin/investors");
    revalidatePath("/investor", "layout");
    return { ok: true };
  }
  const { error } = await supabase.from("yeobo_photo_sessions").upsert(
    {
      branch: input.branch,
      studio,
      package_label: pkg,
      period_year: input.periodYear,
      period_month: input.periodMonth,
      sessions: Math.round(input.sessions),
      sort_order: input.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
      updated_by: gate.userId,
    },
    { onConflict: "branch,studio,package_label,period_year,period_month" }
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true };
}
