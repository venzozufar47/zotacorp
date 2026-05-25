"use server";

/**
 * CRUD untuk `employee_branch_map`. Dipakai pipeline categorize.ts
 * untuk auto-fill branch pada transaksi Salaries & Wages berdasarkan
 * nama karyawan di deskripsi.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

export interface EmployeeBranchRow {
  id: string;
  businessUnit: string;
  nameKeyword: string;
  branch: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listEmployeeBranchMap(
  businessUnit?: string
): Promise<ActionResult<EmployeeBranchRow[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  let q = supabase
    .from("employee_branch_map")
    .select("id, business_unit, name_keyword, branch, notes, created_at, updated_at")
    .order("business_unit", { ascending: true })
    .order("name_keyword", { ascending: true });
  if (businessUnit) q = q.eq("business_unit", businessUnit);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  const rows: EmployeeBranchRow[] = (data ?? []).map((r) => ({
    id: r.id,
    businessUnit: r.business_unit,
    nameKeyword: r.name_keyword,
    branch: r.branch,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  return { ok: true, data: rows };
}

export async function createEmployeeBranchEntry(input: {
  businessUnit: string;
  nameKeyword: string;
  branch: string;
  notes?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  if (!input.businessUnit.trim()) return { ok: false, error: "BU wajib" };
  if (!input.nameKeyword.trim())
    return { ok: false, error: "Nama keyword wajib" };
  if (!input.branch.trim()) return { ok: false, error: "Branch wajib" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_branch_map")
    .insert({
      business_unit: input.businessUnit.trim(),
      name_keyword: input.nameKeyword.trim(),
      branch: input.branch.trim(),
      notes: input.notes?.trim() || null,
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/finance/employees");
  return { ok: true, data: { id: data.id } };
}

export async function updateEmployeeBranchEntry(
  id: string,
  patch: {
    nameKeyword?: string;
    branch?: string;
    notes?: string | null;
  }
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const update: {
    name_keyword?: string;
    branch?: string;
    notes?: string | null;
  } = {};
  if (patch.nameKeyword !== undefined) {
    if (!patch.nameKeyword.trim())
      return { ok: false, error: "Nama keyword wajib" };
    update.name_keyword = patch.nameKeyword.trim();
  }
  if (patch.branch !== undefined) {
    if (!patch.branch.trim()) return { ok: false, error: "Branch wajib" };
    update.branch = patch.branch.trim();
  }
  if (patch.notes !== undefined) {
    update.notes = patch.notes?.trim() || null;
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_branch_map")
    .update(update)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/finance/employees");
  return { ok: true };
}

export async function deleteEmployeeBranchEntry(
  id: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_branch_map")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/finance/employees");
  return { ok: true };
}
