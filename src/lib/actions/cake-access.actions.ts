"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requireAdmin, type ActionResult } from "./_gates";
import { getMyCakeAccess as getMyCakeAccessCached } from "@/lib/cake-orders/access";
import type { CakeBranch } from "@/lib/cake-orders/types";

/**
 * Admin assigns / unassigns cake-feature scopes to specific users.
 * Two scopes:
 *   - 'orders'     → /cake-orders (input form, paid/refund). Branch-
 *      agnostic — orders staff lihat semua cabang.
 *   - 'production' → /cake-production. Branch-spesifik: tim hanya
 *      lihat slip + order untuk cabang yang ditugaskan ke mereka.
 *      Satu user boleh punya banyak baris assignment, mis.
 *      (baker, pare) + (baker, semarang).
 */

export type CakeAccessScope = "orders" | "production";
/** Sub-role di scope production. Null = boleh kedua (back-compat). */
export type CakeProductionRole = "baker" | "decorator" | null;

function adminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface CakeAccessRow {
  id: string;
  user_id: string;
  scope: CakeAccessScope;
  production_role: CakeProductionRole;
  branch: CakeBranch | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
}

/**
 * Re-export of the request-cached snapshot. Lives in a non-"use server"
 * module (`@/lib/cake-orders/access`) because React `cache()` doesn't
 * survive the server-action restriction that every export be an async
 * function declaration.
 */
export async function getMyCakeAccess(): Promise<{
  hasOrders: boolean;
  hasProduction: boolean;
  productionBranches: CakeBranch[];
}> {
  return getMyCakeAccessCached();
}

/** Admin manager: list all assignments + the user identity they need. */
export async function listCakeAccessAssignments(): Promise<
  ActionResult<CakeAccessRow[]>
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("cake_access_assignments" as never)
    .select(
      "id, user_id, scope, production_role, branch, profiles!cake_access_assignments_user_id_fkey(full_name, email, avatar_url, avatar_seed)"
    );
  if (error) return { ok: false, error: error.message };
  type Row = {
    id: string;
    user_id: string;
    scope: CakeAccessScope;
    production_role: CakeProductionRole;
    branch: CakeBranch | null;
    profiles: {
      full_name: string | null;
      email: string | null;
      avatar_url: string | null;
      avatar_seed: string | null;
    };
  };
  const rows = (data ?? []) as unknown as Row[];
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      scope: r.scope,
      production_role: r.production_role,
      branch: r.branch,
      full_name: r.profiles.full_name,
      email: r.profiles.email,
      avatar_url: r.profiles.avatar_url,
      avatar_seed: r.profiles.avatar_seed,
    })),
  };
}

export interface AssignCakeAccessInput {
  userId: string;
  scope: CakeAccessScope;
  productionRole?: CakeProductionRole;
  branch?: CakeBranch | null;
}

export async function assignCakeAccess(
  input: AssignCakeAccessInput
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  // Branch wajib untuk scope='production'; null untuk 'orders' (akses
  // semua cabang).
  const branch = input.scope === "production" ? input.branch ?? null : null;
  if (input.scope === "production" && !branch) {
    return {
      ok: false,
      error: "Penugasan produksi wajib pilih cabang (Pare / Semarang)",
    };
  }
  const role =
    input.scope === "production" ? input.productionRole ?? null : null;

  const supabase = adminClient();
  // Cek duplikat manual karena unique index pakai coalesce expression
  // (PostgREST tidak bisa `onConflict` ke expression unique).
  let q = supabase
    .from("cake_access_assignments" as never)
    .select("id")
    .eq("user_id", input.userId)
    .eq("scope", input.scope);
  q = role === null ? q.is("production_role", null) : q.eq("production_role", role);
  q = branch === null ? q.is("branch", null) : q.eq("branch", branch);
  const { data: existing } = await q.maybeSingle();
  if (existing) {
    return { ok: true }; // sudah ada, idempotent
  }

  const { error } = await supabase
    .from("cake_access_assignments" as never)
    .insert({
      user_id: input.userId,
      scope: input.scope,
      production_role: role,
      branch,
      assigned_by: gate.userId,
    } as never);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cake-orders/access");
  return { ok: true };
}

export async function revokeCakeAccessById(
  assignmentId: string
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { error } = await supabase
    .from("cake_access_assignments" as never)
    .delete()
    .eq("id", assignmentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cake-orders/access");
  return { ok: true };
}
