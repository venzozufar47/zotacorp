"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requireAdmin, type ActionResult } from "./_gates";
import { getMyCakeAccess as getMyCakeAccessCached } from "@/lib/cake-orders/access";

/**
 * Admin assigns / unassigns cake-feature scopes to specific users.
 * Two scopes:
 *   - 'orders'     → /cake-orders (input form, paid/refund)
 *   - 'production' → /cake-production (read sent slips, mark status)
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
  user_id: string;
  scope: CakeAccessScope;
  production_role: CakeProductionRole;
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
  // PostgREST can't auto-pick the right join because cake_access_assignments
  // has two FKs to profiles (user_id + assigned_by). Name the constraint
  // explicitly so the embed resolves to the assignee, not the admin who
  // assigned them.
  const { data, error } = await supabase
    .from("cake_access_assignments" as never)
    .select(
      "user_id, scope, production_role, profiles!cake_access_assignments_user_id_fkey(full_name, email, avatar_url, avatar_seed)"
    );
  if (error) return { ok: false, error: error.message };
  type Row = {
    user_id: string;
    scope: CakeAccessScope;
    production_role: CakeProductionRole;
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
      user_id: r.user_id,
      scope: r.scope,
      production_role: r.production_role,
      full_name: r.profiles.full_name,
      email: r.profiles.email,
      avatar_url: r.profiles.avatar_url,
      avatar_seed: r.profiles.avatar_seed,
    })),
  };
}

export async function assignCakeAccess(
  userId: string,
  scope: CakeAccessScope,
  productionRole: CakeProductionRole = null
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  // production_role hanya valid kalau scope='production'. Untuk scope
  // 'orders' tetap null supaya DB check constraint tidak menolak.
  const role = scope === "production" ? productionRole : null;
  const { error } = await supabase
    .from("cake_access_assignments" as never)
    .upsert(
      {
        user_id: userId,
        scope,
        production_role: role,
        assigned_by: gate.userId,
      } as never,
      { onConflict: "user_id,scope" }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cake-orders/access");
  return { ok: true };
}

export async function revokeCakeAccess(
  userId: string,
  scope: CakeAccessScope
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const supabase = adminClient();
  const { error } = await supabase
    .from("cake_access_assignments" as never)
    .delete()
    .eq("user_id", userId)
    .eq("scope", scope);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/cake-orders/access");
  return { ok: true };
}
