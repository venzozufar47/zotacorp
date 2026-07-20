"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  CAKE_BRANCH_LABELS,
  type CakeBranch,
} from "@/lib/cake-orders/types";

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
 * Self-or-admin gate for investor-scoped READS. Admin passes for any
 * `userId`; otherwise the caller may only act on their OWN id.
 *
 * Closes an IDOR: several investor reads run on the service-role client
 * (which bypasses RLS) while trusting a client-supplied `userId`. Server
 * actions are publicly invokable, so without this gate an investor could
 * pass another investor's id and read their contracts/payouts.
 */
export async function requireSelfOrAdmin(
  userId: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "admin") return { ok: true, userId: user.id };
  if (user.id === userId) return { ok: true, userId: user.id };
  return { ok: false, error: "Forbidden" };
}

/**
 * Admin OR an investor assigned to `businessUnit`. Mirrors the DB RLS
 * helper `is_investor_for_business_unit`: an investor may read a BU's
 * aggregate data only if they hold an assignment row for it. Used to gate
 * service-role reads of BU-level investor data (e.g. monthly metrics).
 */
export async function requireAdminOrInvestorForBu(
  businessUnit: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "admin") return { ok: true, userId: user.id };
  const supabase = await createClient();
  const { data } = await supabase
    .from("investor_business_unit_assignments")
    .select("business_unit")
    .eq("user_id", user.id)
    .eq("business_unit", businessUnit)
    .maybeSingle();
  if (!data) return { ok: false, error: "Forbidden" };
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
 * Yeobo Booth — admin Zota atau admin Yeobo Booth (membership table
 * `yeobo_booth_admins`, lihat migration 063). Dipakai semua server
 * action di modul scheduling photobooth.
 */
export async function requireYeoboBoothAccess(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "admin") return { ok: true, userId: user.id };
  const supabase = await createClient();
  const { data } = await supabase
    .from("yeobo_booth_admins" as never)
    .select("user_id")
    .eq("user_id", user.id)
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
  branch: CakeBranch
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
      error: `Hanya ${role} cabang ${CAKE_BRANCH_LABELS[branch]} yang boleh aksi ini`,
    };
  }
  return { ok: true, userId: user.id };
}

/**
 * Ticketing — boleh MEMBUAT tiket: admin, Kepala Studio (membership
 * `studio_heads`), atau karyawan business_unit='Yeobo Space'.
 */
export async function requireTicketFiler(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "admin") return { ok: true, userId: user.id };
  if (role === "investor") return { ok: false, error: "Forbidden" };
  const supabase = await createClient();
  const [{ data: head }, { data: prof }] = await Promise.all([
    supabase
      .from("studio_heads" as never)
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("profiles").select("business_unit").eq("id", user.id).maybeSingle(),
  ]);
  if (head) return { ok: true, userId: user.id };
  if ((prof?.business_unit ?? "").trim() === "Yeobo Space")
    return { ok: true, userId: user.id };
  return { ok: false, error: "Forbidden" };
}

/**
 * Ticketing — boleh MENINDAKLANJUTI tiket (mulai/selesai/eskalasi):
 * admin (owner) atau Kepala Studio.
 */
export async function requireStudioHeadOrAdmin(): Promise<
  { ok: true; userId: string; isAdmin: boolean } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role === "admin") return { ok: true, userId: user.id, isAdmin: true };
  const supabase = await createClient();
  const { data } = await supabase
    .from("studio_heads" as never)
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id, isAdmin: false };
}

/**
 * Kartu SIM — kelola master data (tambah/ubah/arsip nomor): admin saja.
 * PIC hanya boleh mencatat isi pulsa (lihat requireSimCardActor).
 */
export async function requireSimAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  return await requireAdmin();
}

/**
 * Kartu SIM — boleh mencatat isi pulsa + memperbarui tenggat untuk SATU
 * kartu: admin (bisa mewakili siapa pun) atau PIC terdaftar kartu itu.
 * PIC manual (pic_name/pic_phone tanpa akun) tidak bisa login → hanya
 * admin yang bisa update kartunya. IDOR-guard: cek kepemilikan by cardId.
 */
export async function requireSimCardActor(
  cardId: string
): Promise<
  { ok: true; userId: string; isAdmin: boolean } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!cardId) return { ok: false, error: "Kartu tidak valid" };
  const role = await getCurrentRole();
  if (role === "admin") return { ok: true, userId: user.id, isAdmin: true };
  const supabase = await createClient();
  const { data } = await supabase
    .from("sim_cards" as never)
    .select("id")
    .eq("id", cardId)
    .eq("pic_user_id", user.id)
    .maybeSingle();
  if (!data) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: user.id, isAdmin: false };
}
