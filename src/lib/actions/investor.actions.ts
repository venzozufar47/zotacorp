"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requireAdmin, type ActionResult } from "./_gates";

function adminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface InvestorSummary {
  userId: string;
  email: string | null;
  fullName: string | null;
  businessUnits: string[];
  createdAt: string;
}

/**
 * Admin only: list semua user role=investor + daftar business_unit
 * assignment mereka. Investor tanpa assignment muncul dengan
 * `businessUnits: []` → UI render sebagai "Belum di-assign".
 */
export async function listInvestorsForAdmin(): Promise<
  ActionResult<InvestorSummary[]>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, created_at")
    .eq("role", "investor")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  const userIds = (profiles ?? []).map((p) => p.id);
  const byUser = new Map<string, string[]>();
  if (userIds.length > 0) {
    const { data: assigns } = await supabase
      .from("investor_business_unit_assignments" as never)
      .select("user_id, business_unit")
      .in("user_id", userIds);
    for (const a of (assigns ?? []) as unknown as Array<{
      user_id: string;
      business_unit: string;
    }>) {
      const arr = byUser.get(a.user_id) ?? [];
      arr.push(a.business_unit);
      byUser.set(a.user_id, arr);
    }
  }
  return {
    ok: true,
    data: (profiles ?? []).map((p) => ({
      userId: p.id,
      email: p.email,
      fullName: p.full_name,
      businessUnits: (byUser.get(p.id) ?? []).sort(),
      createdAt: p.created_at,
    })),
  };
}

export async function assignInvestorBusinessUnit(input: {
  userId: string;
  businessUnit: string;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.userId || !input.businessUnit.trim()) {
    return { ok: false, error: "userId dan businessUnit wajib" };
  }
  const supabase = adminClient();
  // Verifikasi target user benar role=investor — guardrail supaya
  // assignment tidak nyasar ke admin/karyawan.
  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", input.userId)
    .maybeSingle();
  if (!target || target.role !== "investor") {
    return { ok: false, error: "User bukan investor" };
  }
  const { error } = await supabase
    .from("investor_business_unit_assignments" as never)
    .insert({
      user_id: input.userId,
      business_unit: input.businessUnit.trim(),
      assigned_by: gate.userId,
    } as never);
  if (error && !error.message.includes("duplicate")) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true };
}

export async function revokeInvestorAssignment(
  assignmentId: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { error } = await supabase
    .from("investor_business_unit_assignments" as never)
    .delete()
    .eq("id", assignmentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/investors");
  revalidatePath("/investor", "layout");
  return { ok: true };
}
