"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

/**
 * Shared server-action result shape + auth gates. Extracted so multiple
 * `*.actions.ts` modules don't each re-declare identical helpers.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

/**
 * Admin + `scope='full'` assignees of `bankAccountId`. Used for
 * cashflow transaction CRUD on per-rekening ACL'd accounts (currently
 * cash rekening). Delete paths still call `requireAdmin` since
 * full-scope assignees have read+input+edit permission only, not
 * delete. `pos_only` assignees do NOT pass this gate — they use the
 * narrower `requireAdminOrPosAssignee` for POS writes.
 */
export async function requireAdminOrAssignee(
  bankAccountId: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "admin") return { ok: true, userId: user.id };
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("bank_account_assignees")
    .select("bank_account_id")
    .eq("bank_account_id", bankAccountId)
    .eq("user_id", user.id)
    .eq("scope", "full")
    .maybeSingle();
  if (!assignment) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

/**
 * Admin + assignee dengan scope 'full' atau 'pos_only'. Dipakai untuk
 * input sale di /pos. User pos_only lulus di sini tapi gagal di
 * `requireAdminOrAssignee`, jadi mereka tidak bisa menyentuh cashflow
 * editor via cashflow.actions.ts.
 */
export async function requireAdminOrPosAssignee(
  bankAccountId: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "admin") return { ok: true, userId: user.id };
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("bank_account_assignees")
    .select("bank_account_id")
    .eq("bank_account_id", bankAccountId)
    .eq("user_id", user.id)
    .in("scope", ["full", "pos_only"])
    .maybeSingle();
  if (!assignment) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

/**
 * Cake-feature access. Cake orders are NOT scoped to a rekening —
 * they're tracked as a separate per-user assignment table
 * (`cake_access_assignments`). Two scopes:
 *   - 'orders'     → fill the input form, mark paid/refund.
 *   - 'production' → read finalised slips, update production_status.
 * A user can hold both rows; admins implicitly pass.
 */
export async function requireAdminOrCakeOrderAccess(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "admin") return { ok: true, userId: user.id };
  const supabase = await createClient();
  const { data } = await supabase
    .from("cake_access_assignments" as never)
    .select("user_id")
    .eq("user_id", user.id)
    .eq("scope", "orders")
    .maybeSingle();
  if (!data) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

export async function requireAdminOrCakeProductionAccess(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "admin") return { ok: true, userId: user.id };
  const supabase = await createClient();
  const { data } = await supabase
    .from("cake_access_assignments" as never)
    .select("user_id, scope")
    .eq("user_id", user.id)
    .in("scope", ["orders", "production"])
    .limit(1)
    .maybeSingle();
  if (!data) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

/**
 * Stricter gate for cake order WRITES: admin role does NOT pass.
 * Per product decision, admin is view-only on cake orders and only
 * manages employee assignments (`/admin/cake-orders/access`) and
 * the dropdown master data (`/admin/cake-orders/options`). Order
 * content edits, payments, status, archive — all employee-only.
 */
export async function requireCakeOrderAccess(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("cake_access_assignments" as never)
    .select("user_id")
    .eq("user_id", user.id)
    .eq("scope", "orders")
    .maybeSingle();
  if (!data) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

/** Stricter production-status gate: admin does NOT pass. */
export async function requireCakeProductionAccess(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("cake_access_assignments" as never)
    .select("user_id, scope")
    .eq("user_id", user.id)
    .in("scope", ["orders", "production"])
    .limit(1)
    .maybeSingle();
  if (!data) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id };
}

/**
 * Sub-gate for production sub-roles. Bagian produksi punya dua sub-role
 * (baker, decorator). User dengan `production_role=null` (legacy) atau
 * scope `'orders'` lolos sebagai both. Admin Zota app TIDAK lolos —
 * konsisten dengan parent gate.
 *
 * Aturan transition tahap produksi:
 *  - pending → in_progress   : "baker" yang panggang dasar kue
 *  - in_progress → decorating: "decorator" yang menghias / gambar
 *  - decorating → done       : "decorator" yang menyelesaikan
 */
export async function requireCakeProductionRole(
  role: "baker" | "decorator",
  branch: "pare" | "semarang"
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("cake_access_assignments" as never)
    .select("scope, production_role, branch")
    .eq("user_id", user.id)
    .in("scope", ["orders", "production"]);
  type Row = {
    scope: string;
    production_role: string | null;
    branch: string | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return { ok: false, error: "Forbidden" };
  // orders scope = lihat semua cabang, semua role.
  // production scope = harus match (role atau null) DAN (branch).
  const allowed = rows.some((r) => {
    if (r.scope === "orders") return true;
    const roleOk = r.production_role == null || r.production_role === role;
    const branchOk = r.branch === branch;
    return roleOk && branchOk;
  });
  if (!allowed) {
    return {
      ok: false,
      error: `Hanya ${role} cabang ${branch} yang boleh aksi ini`,
    };
  }
  return { ok: true, userId: user.id };
}
