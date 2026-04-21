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
