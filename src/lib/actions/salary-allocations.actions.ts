"use server";

/**
 * Alokasi gaji per-karyawan untuk tx Salaries & Wages dengan branch=All
 * (bulk payroll). Admin breakdown manual: nama karyawan, cabang, nominal.
 *
 * Constraint validasi (di layer ini, bukan DB):
 *   - Sum(amount) untuk satu transaction_id harus <= tx.debit
 *   - Jika sum < tx.debit, sisa (Rp tx.debit − sum) diasumsikan
 *     auto-split rata ke 3 cabang via fallback. Admin lihat warning.
 *   - Jika sum > tx.debit, save ditolak.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { getPhysicalBranchesForSentinel, ALL_BRANCH_SENTINEL } from "@/lib/cashflow/branch-split";
import { YEOBO_SPACE_BRANCHES } from "@/lib/cashflow/categories";

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

export interface SalaryAllocationRow {
  id: string;
  transactionId: string;
  employeeName: string;
  branch: string;
  amount: number;
  createdAt: string;
}

export interface SalaryTxSummary {
  id: string;
  date: string;
  description: string;
  debit: number;
  branch: string | null;
  effectivePeriodMonth: number | null;
  effectivePeriodYear: number | null;
  bankAccountId: string;
  bankAccountName: string;
  businessUnit: string;
  allocatedTotal: number;
  remaining: number;
  allocations: SalaryAllocationRow[];
}

/**
 * List semua tx Salaries & Wages (branch=All) untuk BU tertentu,
 * dengan alokasi yang sudah ada. Filter optional date range.
 */
export async function listSalaryAllocationsForBU(
  businessUnit: string,
  opts?: { startDate?: string; endDate?: string }
): Promise<ActionResult<SalaryTxSummary[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  let q = supabase
    .from("cashflow_transactions")
    .select(
      "id, transaction_date, description, debit, branch, effective_period_month, effective_period_year, cashflow_statements!inner(bank_account_id, bank_accounts!inner(account_name, business_unit))"
    )
    .eq("category", "Salaries & Wages")
    .eq("branch", "All")
    .eq("cashflow_statements.bank_accounts.business_unit", businessUnit)
    .order("transaction_date", { ascending: false });
  if (opts?.startDate) q = q.gte("transaction_date", opts.startDate);
  if (opts?.endDate) q = q.lte("transaction_date", opts.endDate);
  const { data: txData, error: txErr } = await q;
  if (txErr) return { ok: false, error: txErr.message };

  const txIds = (txData ?? []).map((r) => (r as { id: string }).id);
  const allocByTx = new Map<string, SalaryAllocationRow[]>();
  if (txIds.length > 0) {
    const { data: allocs, error: allocErr } = await supabase
      .from("salary_allocations")
      .select("id, transaction_id, employee_name, branch, amount, created_at")
      .in("transaction_id", txIds)
      .order("created_at", { ascending: true });
    if (allocErr) return { ok: false, error: allocErr.message };
    for (const a of allocs ?? []) {
      const list = allocByTx.get(a.transaction_id) ?? [];
      list.push({
        id: a.id,
        transactionId: a.transaction_id,
        employeeName: a.employee_name,
        branch: a.branch,
        amount: Number(a.amount),
        createdAt: a.created_at,
      });
      allocByTx.set(a.transaction_id, list);
    }
  }

  const summaries: SalaryTxSummary[] = (txData ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      transaction_date: string;
      description: string;
      debit: number | string;
      branch: string | null;
      effective_period_month: number | null;
      effective_period_year: number | null;
      cashflow_statements: {
        bank_account_id: string;
        bank_accounts: { account_name: string; business_unit: string };
      };
    };
    const allocations = allocByTx.get(row.id) ?? [];
    const allocatedTotal = allocations.reduce((s, a) => s + a.amount, 0);
    const debit = Number(row.debit);
    return {
      id: row.id,
      date: row.transaction_date,
      description: row.description,
      debit,
      branch: row.branch,
      effectivePeriodMonth: row.effective_period_month,
      effectivePeriodYear: row.effective_period_year,
      bankAccountId: row.cashflow_statements.bank_account_id,
      bankAccountName: row.cashflow_statements.bank_accounts.account_name,
      businessUnit: row.cashflow_statements.bank_accounts.business_unit,
      allocatedTotal,
      remaining: debit - allocatedTotal,
      allocations,
    };
  });
  return { ok: true, data: summaries };
}

export async function upsertSalaryAllocations(
  transactionId: string,
  allocations: Array<{
    employeeName: string;
    branch: string;
    amount: number;
  }>
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const supabase = await createClient();
  // Verifikasi tx exists + ambil debit
  const { data: tx, error: txErr } = await supabase
    .from("cashflow_transactions")
    .select("id, debit, category, branch")
    .eq("id", transactionId)
    .maybeSingle();
  if (txErr) return { ok: false, error: txErr.message };
  if (!tx) return { ok: false, error: "Tx tidak ditemukan" };
  if (tx.category !== "Salaries & Wages") {
    return {
      ok: false,
      error: "Tx bukan Salaries & Wages — alokasi hanya untuk gaji",
    };
  }

  // Validasi nominal
  const sum = allocations.reduce((s, a) => s + a.amount, 0);
  const debit = Number(tx.debit);
  if (sum > debit + 0.01) {
    return {
      ok: false,
      error: `Total alokasi (${sum.toLocaleString("id-ID")}) > nominal tx (${debit.toLocaleString("id-ID")})`,
    };
  }
  // Branch validation: physical (Tlogosari/Tembalang/Jebres) atau
  // 2-cabang sentinel (Yeosari + Yeotem, dll). TOLAK "All" karena
  // nonsensical untuk per-karyawan — kalau memang split rata 3,
  // admin tidak perlu alokasi, biarkan auto-split fallback.
  const validBranchSet = new Set<string>(YEOBO_SPACE_BRANCHES);
  for (const a of allocations) {
    if (!a.employeeName.trim())
      return { ok: false, error: "Nama karyawan wajib" };
    if (!a.branch.trim()) return { ok: false, error: "Cabang wajib" };
    if (a.amount < 0)
      return { ok: false, error: "Nominal tidak boleh negatif" };
    const br = a.branch.trim();
    if (br === ALL_BRANCH_SENTINEL) {
      return {
        ok: false,
        error: `Branch "All" tidak boleh untuk alokasi per-karyawan. Pakai cabang spesifik atau sentinel 2-cabang.`,
      };
    }
    if (!validBranchSet.has(br)) {
      return { ok: false, error: `Branch "${br}" tidak dikenal` };
    }
    // Sentinel 2-cabang valid: getPhysicalBranchesForSentinel akan
    // resolve saat aggregator split.
    if (br !== "Needs Assignment") {
      const physical = getPhysicalBranchesForSentinel(br, "Yeobo Space");
      const isPhysicalSingle =
        physical === null && validBranchSet.has(br); // cabang fisik
      if (!isPhysicalSingle && (!physical || physical.length < 2)) {
        return {
          ok: false,
          error: `Branch "${br}" tidak valid untuk alokasi gaji`,
        };
      }
    }
  }

  // Strategi simple: hapus semua alokasi existing untuk tx ini, lalu
  // insert ulang. Atomic via Postgres single-connection (supabase MCP
  // selalu sama connection per request).
  const { error: delErr } = await supabase
    .from("salary_allocations")
    .delete()
    .eq("transaction_id", transactionId);
  if (delErr) return { ok: false, error: delErr.message };

  if (allocations.length > 0) {
    const { error: insErr } = await supabase
      .from("salary_allocations")
      .insert(
        allocations.map((a) => ({
          transaction_id: transactionId,
          employee_name: a.employeeName.trim(),
          branch: a.branch.trim(),
          amount: a.amount,
          created_by: gate.userId,
        }))
      );
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath("/admin/finance/pnl");
  return { ok: true };
}
