"use server";

/**
 * Assignment workflow untuk transaksi cashflow yang admin tidak bisa
 * kategorikan sendiri (mis. Shopee/Tokopedia/QRIS tanpa keterangan).
 * Admin pilih assignee (biasanya kepala studio), assignee buka queue
 * mereka dan set category + branch yang benar.
 *
 * Status diturunkan dari kombinasi field:
 *   - `assigned_to_user_id IS NULL` & `category = "Needs Assignment"`
 *     → menunggu admin pilih assignee
 *   - `assigned_to_user_id IS NOT NULL` & `category = "Needs Assignment"`
 *     → di queue assignee, belum resolved
 *   - kategori bukan lagi "Needs Assignment" → resolved (assignee_id
 *     dipertahankan sebagai audit trail siapa yang nge-handle)
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const NEEDS_ASSIGNMENT = "Needs Assignment";

/**
 * Admin pilih (atau lepas) assignee untuk tx tertentu. Pass `userId=null`
 * untuk unassign. Hanya admin yang boleh meng-assign.
 */
export async function assignTransaction(
  rowId: string,
  userId: string | null
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("cashflow_transactions")
    .update({ assigned_to_user_id: userId })
    .eq("id", rowId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/finance", "layout");
  revalidatePath("/employee/finance/assignments");
  return { ok: true };
}

export interface BuDefaultAssignment {
  businessUnit: string;
  userId: string | null;
  userName: string | null;
  pendingCount: number;
}

/**
 * Tarik default assignee per BU + jumlah tx Needs Assignment yang
 * belum di-assign (untuk UX feedback). Hanya admin.
 */
export async function listBuDefaultAssignments(): Promise<
  ActionResult<BuDefaultAssignment[]>
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const { data: bus, error } = await supabase
    .from("business_units")
    .select("name, default_needs_assignment_user_id")
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };

  // Resolve nama profile sekali (batch) untuk semua BU yang punya default.
  const userIds = Array.from(
    new Set(
      (bus ?? [])
        .map((b) => b.default_needs_assignment_user_id)
        .filter((id): id is string => !!id)
    )
  );
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of profiles ?? []) nameById.set(p.id, p.full_name);
  }

  // Hitung pending per-BU. 1 query gabungan (group by BU di app layer).
  const { data: pendingTx } = await supabase
    .from("cashflow_transactions")
    .select(
      "id, cashflow_statements!inner(bank_accounts!inner(business_unit))"
    )
    .is("assigned_to_user_id", null)
    .or(`category.eq.${NEEDS_ASSIGNMENT},branch.eq.${NEEDS_ASSIGNMENT}`);
  const pendingPerBu = new Map<string, number>();
  for (const row of pendingTx ?? []) {
    const bu = (
      row as unknown as {
        cashflow_statements: { bank_accounts: { business_unit: string } };
      }
    ).cashflow_statements.bank_accounts.business_unit;
    pendingPerBu.set(bu, (pendingPerBu.get(bu) ?? 0) + 1);
  }

  const out: BuDefaultAssignment[] = (bus ?? []).map((b) => ({
    businessUnit: b.name,
    userId: b.default_needs_assignment_user_id,
    userName: b.default_needs_assignment_user_id
      ? nameById.get(b.default_needs_assignment_user_id) ?? null
      : null,
    pendingCount: pendingPerBu.get(b.name) ?? 0,
  }));
  return { ok: true, data: out };
}

/**
 * Set default assignee untuk 1 BU. Sifat permanen — semua tx Needs
 * Assignment baru di BU ini otomatis ter-assign ke user ini.
 *
 * Side effect: backfill semua existing pending tx (assignedUserId IS NULL
 * + category/branch=Needs Assignment + di rekening BU ini) ke user baru,
 * supaya tidak ada gap. Tx yang sudah di-assign ke user LAIN tidak
 * di-override (admin override manual via bulk button kalau perlu).
 */
export async function setBusinessUnitDefaultAssignee(
  businessUnit: string,
  userId: string | null
): Promise<ActionResult<{ backfilled: number }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };

  const supabase = await createClient();

  // 1. Update default field di business_units.
  const { error: upErr } = await supabase
    .from("business_units")
    .update({ default_needs_assignment_user_id: userId })
    .eq("name", businessUnit);
  if (upErr) return { ok: false, error: upErr.message };

  // 2. Backfill existing pending tx kalau ada default baru.
  let backfilled = 0;
  if (userId) {
    // Ambil tx ID dulu lewat join (PostgREST tidak izinkan UPDATE +
    // inner-join filter dalam 1 query). Lalu UPDATE pakai .in().
    const { data: pendingTx } = await supabase
      .from("cashflow_transactions")
      .select(
        "id, cashflow_statements!inner(bank_accounts!inner(business_unit))"
      )
      .is("assigned_to_user_id", null)
      .or(`category.eq.${NEEDS_ASSIGNMENT},branch.eq.${NEEDS_ASSIGNMENT}`)
      .eq("cashflow_statements.bank_accounts.business_unit", businessUnit);
    const ids = (pendingTx ?? []).map((r) => (r as { id: string }).id);
    if (ids.length > 0) {
      const { error: bfErr, count } = await supabase
        .from("cashflow_transactions")
        .update({ assigned_to_user_id: userId }, { count: "exact" })
        .in("id", ids);
      if (bfErr) return { ok: false, error: bfErr.message };
      backfilled = count ?? ids.length;
    }
  }

  revalidatePath("/admin/finance", "layout");
  revalidatePath("/assignments");
  return { ok: true, data: { backfilled } };
}

/**
 * Helper: tarik default assignee untuk 1 BU. Dipakai commit endpoint
 * supaya tx Needs Assignment baru otomatis ter-assign.
 *
 * Pure read; tidak butuh admin gate (commit endpoint sudah admin gated).
 */
export async function getBuDefaultAssigneeId(
  businessUnit: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_units")
    .select("default_needs_assignment_user_id")
    .eq("name", businessUnit)
    .maybeSingle();
  return data?.default_needs_assignment_user_id ?? null;
}

/**
 * Bulk assign N transaksi sekaligus ke 1 karyawan. Dipakai admin
 * "Assign semua ke X" workflow — pilih sekali, terdistribusi ke semua
 * tx pending. Pass `userId=null` untuk unassign batch.
 */
export async function assignManyTransactions(
  rowIds: string[],
  userId: string | null
): Promise<ActionResult<{ applied: number }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };
  if (rowIds.length === 0)
    return { ok: true, data: { applied: 0 } };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("cashflow_transactions")
    .update({ assigned_to_user_id: userId }, { count: "exact" })
    .in("id", rowIds);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/finance", "layout");
  revalidatePath("/employee/finance/assignments");
  return { ok: true, data: { applied: count ?? rowIds.length } };
}

/**
 * Assignee (atau admin) set category + branch + optional effective_period
 * untuk tx yang ada di queue mereka. Setelah resolve, tx tetap punya
 * `assigned_to_user_id` sebagai audit trail.
 *
 * Auth: current user harus admin, ATAU current user = assigned_to_user_id
 * pada baris itu.
 */
export async function resolveAssignment(
  rowId: string,
  patch: {
    category: string;
    branch: string;
    effectivePeriodMonth?: number | null;
    effectivePeriodYear?: number | null;
  }
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  if (!patch.category.trim()) {
    return { ok: false, error: "Category wajib" };
  }
  if (!patch.branch.trim()) {
    return { ok: false, error: "Branch wajib" };
  }

  const supabase = await createClient();

  // Pakai RPC `resolve_assignment` (SECURITY DEFINER). Direct UPDATE
  // tidak bisa dipakai non-admin assignee: tabel cashflow_transactions
  // TIDAK punya SELECT policy untuk assignee (hanya admin/investor/POS),
  // dan Postgres butuh row SELECT-visible untuk meng-UPDATE-nya → UPDATE
  // assignee selalu match 0 row walau policy UPDATE-nya lolos. RPC ini
  // melakukan cek admin-atau-assignee sendiri lalu update dengan
  // privilege definer (tanpa membocorkan running_balance ke assignee).
  const { data, error } = await supabase.rpc("resolve_assignment", {
    p_row_id: rowId,
    p_category: patch.category.trim(),
    p_branch: patch.branch.trim(),
    p_effective_period_month: patch.effectivePeriodMonth ?? null,
    p_effective_period_year: patch.effectivePeriodYear ?? null,
  });
  if (error) return { ok: false, error: error.message };
  if (data !== true) {
    return {
      ok: false,
      error: "Forbidden — kamu bukan assignee row ini atau row sudah resolved",
    };
  }

  revalidatePath("/admin/finance", "layout");
  revalidatePath("/assignments");
  return { ok: true };
}

export interface AssignableProfile {
  id: string;
  fullName: string;
  email: string;
  role: string;
  businessUnit: string | null;
}

/**
 * Daftar profile yang boleh dipilih sebagai assignee. Saat ini:
 * semua profile aktif (admin pilih siapa saja). Bisa di-filter di UI
 * lewat search box.
 */
export async function listAssignableProfiles(): Promise<
  ActionResult<AssignableProfile[]>
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, business_unit, is_active")
    .neq("role", "investor")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const list: AssignableProfile[] = (data ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    email: p.email,
    role: p.role,
    businessUnit: p.business_unit,
  }));
  return { ok: true, data: list };
}

export interface AssignmentRow {
  id: string;
  date: string;
  bankAccountId: string;
  bankAccountName: string;
  businessUnit: string;
  debit: number;
  credit: number;
  description: string;
  sourceDestination: string | null;
  transactionDetails: string | null;
  notes: string | null;
  category: string | null;
  branch: string | null;
  effectivePeriodMonth: number | null;
  effectivePeriodYear: number | null;
  assignedToUserId: string | null;
  assigneeName: string | null;
}

/**
 * Untuk admin: semua tx yang masih butuh assignment (category atau
 * branch masih "Needs Assignment"). Diurutkan dari yang BELUM diassign
 * dulu (assigned_to_user_id IS NULL), supaya admin lihat backlog yang
 * perlu di-distribusikan.
 */
export async function listAllAssignments(): Promise<
  ActionResult<AssignmentRow[]>
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const role = await getCurrentRole();
  if (role !== "admin") return { ok: false, error: "Forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cashflow_transactions")
    .select(
      "id, transaction_date, description, source_destination, transaction_details, notes, debit, credit, category, branch, effective_period_month, effective_period_year, assigned_to_user_id, cashflow_statements!inner(bank_account_id, bank_accounts!inner(account_name, business_unit))"
    )
    .or(`category.eq.${NEEDS_ASSIGNMENT},branch.eq.${NEEDS_ASSIGNMENT}`)
    .order("assigned_to_user_id", { ascending: true, nullsFirst: true })
    .order("transaction_date", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const userIds = Array.from(
    new Set(
      (data ?? [])
        .map((r) => (r as { assigned_to_user_id: string | null }).assigned_to_user_id)
        .filter((id): id is string => !!id)
    )
  );
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      nameById.set(p.id, p.full_name ?? "(tanpa nama)");
    }
  }

  const rows: AssignmentRow[] = (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      transaction_date: string;
      description: string;
      source_destination: string | null;
      transaction_details: string | null;
      notes: string | null;
      debit: number | string;
      credit: number | string;
      category: string | null;
      branch: string | null;
      effective_period_month: number | null;
      effective_period_year: number | null;
      assigned_to_user_id: string | null;
      cashflow_statements: {
        bank_account_id: string;
        bank_accounts: { account_name: string; business_unit: string };
      };
    };
    return {
      id: row.id,
      date: row.transaction_date,
      bankAccountId: row.cashflow_statements.bank_account_id,
      bankAccountName: row.cashflow_statements.bank_accounts.account_name,
      businessUnit: row.cashflow_statements.bank_accounts.business_unit,
      debit: Number(row.debit),
      credit: Number(row.credit),
      description: row.description,
      sourceDestination: row.source_destination,
      transactionDetails: row.transaction_details,
      notes: row.notes,
      category: row.category,
      branch: row.branch,
      effectivePeriodMonth: row.effective_period_month,
      effectivePeriodYear: row.effective_period_year,
      assignedToUserId: row.assigned_to_user_id,
      assigneeName: row.assigned_to_user_id
        ? nameById.get(row.assigned_to_user_id) ?? "(unknown)"
        : null,
    };
  });
  return { ok: true, data: rows };
}

/**
 * Cheap count untuk badge nav. Pakai RPC `count_my_needs_assignments`
 * (SECURITY DEFINER) supaya non-admin user juga bisa hitung tx
 * mereka sendiri tanpa kena RLS block.
 */
export async function countMyAssignments(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { data } = await supabase.rpc("count_my_needs_assignments");
  return typeof data === "number" ? data : 0;
}

/**
 * Untuk assignee non-admin: tx yang di-assign ke mereka dan masih
 * belum resolved (kategori atau branch masih "Needs Assignment").
 *
 * Pakai RPC `get_my_needs_assignments()` (SECURITY DEFINER) supaya
 * non-admin user bisa baca tx yang assigned ke mereka tanpa harus
 * grant blanket SELECT di cashflow_transactions. Function ini juga
 * sengaja TIDAK return `running_balance` — assignee gak boleh lihat
 * saldo rekening.
 */
export async function getMyAssignments(): Promise<
  ActionResult<AssignmentRow[]>
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_needs_assignments");
  if (error) return { ok: false, error: error.message };

  const rows: AssignmentRow[] = ((data ?? []) as Array<{
    id: string;
    transaction_date: string;
    description: string;
    source_destination: string | null;
    transaction_details: string | null;
    notes: string | null;
    debit: number | string;
    credit: number | string;
    category: string | null;
    branch: string | null;
    effective_period_month: number | null;
    effective_period_year: number | null;
    assigned_to_user_id: string | null;
    bank_account_id: string;
    bank_account_name: string;
    business_unit: string;
  }>).map((row) => ({
    id: row.id,
    date: row.transaction_date,
    bankAccountId: row.bank_account_id,
    bankAccountName: row.bank_account_name,
    businessUnit: row.business_unit,
    debit: Number(row.debit),
    credit: Number(row.credit),
    description: row.description,
    sourceDestination: row.source_destination,
    transactionDetails: row.transaction_details,
    notes: row.notes,
    category: row.category,
    branch: row.branch,
    effectivePeriodMonth: row.effective_period_month,
    effectivePeriodYear: row.effective_period_year,
    assignedToUserId: row.assigned_to_user_id,
    assigneeName: null,
  }));
  return { ok: true, data: rows };
}
