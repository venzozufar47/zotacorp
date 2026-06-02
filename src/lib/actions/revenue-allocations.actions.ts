"use server";

/**
 * Alokasi revenue per-cabang BULANAN untuk Yeobo Space. Operating
 * revenue (Revenue / Other Revenue) yang di-posting dengan branch="All"
 * default-nya dibagi rata 1/3 ke tiga cabang di PnL. Admin malah ingin
 * membagi TOTAL revenue branch=All tiap BULAN ke tiga cabang secara
 * manual (bukan per-transaksi).
 *
 * Disimpan satu baris per (business_unit, year, month, branch).
 * Aggregator membagi revenue branch=All bulan itu PROPORSIONAL terhadap
 * amount yang disimpan (ratio = amount_b / Σamount) sehingga split
 * selalu pas dengan revenue aktual walau transaksi berubah.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  getCategoryPresets,
  getNonOperatingCategories,
} from "@/lib/cashflow/categories";

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

/** Operating-credit categories = credit categories minus non-operating.
 *  Yeobo: Revenue + Other Revenue. */
export async function getOperatingCreditCategories(
  businessUnit: string
): Promise<string[]> {
  const presets = getCategoryPresets(businessUnit);
  const nonOp = new Set(getNonOperatingCategories(businessUnit));
  return presets.credit.filter((c) => !nonOp.has(c));
}

export interface RevenueMonthAllocationRow {
  branch: string;
  amount: number;
}

export interface RevenueMonthSummary {
  year: number;
  month: number;
  /** "YYYY-MM" */
  monthKey: string;
  /** Total operating revenue branch="All" bulan ini (yang akan dibagi). */
  totalAll: number;
  /** Alokasi tersimpan (kosong = belum, PnL auto-split 1/3). */
  allocations: RevenueMonthAllocationRow[];
  allocatedTotal: number;
  /**
   * Operating revenue yang SUDAH ter-atribusi ke cabang spesifik
   * (mis. setoran cash per cabang) — TIDAK masuk pot alokasi karena
   * cabangnya sudah pasti. Ditampilkan agar admin paham total revenue
   * cabang penuh = totalAll (dialokasi) + ini.
   */
  branchSpecificByBranch: Record<string, number>;
  branchSpecificTotal: number;
  /** totalAll + branchSpecificTotal — total revenue operasional bulan ini. */
  grandTotal: number;
}

const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

/**
 * Per-bulan dalam range: total operating revenue branch="All" + alokasi
 * tersimpan. Hanya bulan yang punya revenue branch="All" > 0 yang
 * dikembalikan (bulan tanpa lump revenue tidak perlu dialokasi).
 */
export async function listRevenueMonthAllocations(
  businessUnit: string,
  range: { from: { year: number; month: number }; to: { year: number; month: number } }
): Promise<ActionResult<RevenueMonthSummary[]>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const opCats = await getOperatingCreditCategories(businessUnit);
  if (opCats.length === 0) return { ok: true, data: [] };

  const startDate = `${ym(range.from.year, range.from.month)}-01`;
  const toLast = new Date(range.to.year, range.to.month, 0).getDate();
  const endDate = `${ym(range.to.year, range.to.month)}-${String(toLast).padStart(2, "0")}`;

  const supabase = await createClient();
  // Fetch ALL operating revenue (every branch) — we bucket branch="All"
  // (goes into the allocation pot) separately from branch-specific
  // revenue (e.g. cash setoran already tagged to a cabang, which is NOT
  // allocated). Paginate to dodge the 1000-row PostgREST cap; a busy
  // month easily exceeds it.
  type RevRow = {
    credit: number | string;
    branch: string | null;
    transaction_date: string;
    effective_period_month: number | null;
    effective_period_year: number | null;
  };
  const txRows: RevRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error: txErr } = await supabase
      .from("cashflow_transactions")
      .select(
        "credit, branch, transaction_date, effective_period_month, effective_period_year, cashflow_statements!inner(bank_accounts!inner(business_unit))"
      )
      .in("category", opCats)
      .gt("credit", 0)
      .eq("cashflow_statements.bank_accounts.business_unit", businessUnit)
      .gte("transaction_date", startDate)
      .lte("transaction_date", endDate)
      .order("transaction_date")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (txErr) return { ok: false, error: txErr.message };
    const batch = (data ?? []) as unknown as RevRow[];
    txRows.push(...batch);
    if (batch.length < PAGE) break;
  }

  // Sum per effective-period month (fall back to transaction_date).
  // totalByMonth = branch="All" (allocatable); branchSpecificByMonth =
  // already-attributed revenue keyed by month then branch.
  const totalByMonth = new Map<string, number>();
  const branchSpecificByMonth = new Map<string, Record<string, number>>();
  for (const row of txRows) {
    let y: number;
    let m: number;
    if (row.effective_period_year != null && row.effective_period_month != null) {
      y = row.effective_period_year;
      m = row.effective_period_month;
    } else {
      const [yy, mm] = row.transaction_date.split("-");
      y = Number(yy);
      m = Number(mm);
    }
    if (!Number.isFinite(y) || !Number.isFinite(m)) continue;
    // Respect the requested range on the effective month too.
    if (
      y < range.from.year ||
      y > range.to.year ||
      (y === range.from.year && m < range.from.month) ||
      (y === range.to.year && m > range.to.month)
    )
      continue;
    const key = ym(y, m);
    const amount = Number(row.credit);
    const branch = (row.branch ?? "").trim();
    if (branch === "All" || branch === "") {
      totalByMonth.set(key, (totalByMonth.get(key) ?? 0) + amount);
    } else {
      const bucket = branchSpecificByMonth.get(key) ?? {};
      bucket[branch] = (bucket[branch] ?? 0) + amount;
      branchSpecificByMonth.set(key, bucket);
    }
  }

  // Existing allocations for this BU in range.
  const { data: allocData, error: allocErr } = await supabase
    .from("revenue_month_allocations")
    .select("period_year, period_month, branch, amount")
    .eq("business_unit", businessUnit);
  if (allocErr) return { ok: false, error: allocErr.message };
  const allocByMonth = new Map<string, RevenueMonthAllocationRow[]>();
  for (const a of allocData ?? []) {
    const key = ym(a.period_year, a.period_month);
    const list = allocByMonth.get(key) ?? [];
    list.push({ branch: a.branch, amount: Number(a.amount) });
    allocByMonth.set(key, list);
  }

  // Union of months that have either allocatable (All) or
  // branch-specific operating revenue.
  const allKeys = new Set<string>([
    ...totalByMonth.keys(),
    ...branchSpecificByMonth.keys(),
  ]);

  const summaries: RevenueMonthSummary[] = [...allKeys]
    .map((key) => {
      const [y, m] = key.split("-").map(Number);
      const allocations = allocByMonth.get(key) ?? [];
      const totalAll = Math.round(totalByMonth.get(key) ?? 0);
      const bsRaw = branchSpecificByMonth.get(key) ?? {};
      const branchSpecificByBranch: Record<string, number> = {};
      let branchSpecificTotal = 0;
      for (const [b, amt] of Object.entries(bsRaw)) {
        const r = Math.round(amt);
        branchSpecificByBranch[b] = r;
        branchSpecificTotal += r;
      }
      return {
        year: y,
        month: m,
        monthKey: key,
        totalAll,
        allocations,
        allocatedTotal: allocations.reduce((s, a) => s + a.amount, 0),
        branchSpecificByBranch,
        branchSpecificTotal,
        grandTotal: totalAll + branchSpecificTotal,
      };
    })
    // Keep months that have something to show (allocatable or attributed).
    .filter((s) => s.totalAll > 0 || s.branchSpecificTotal > 0)
    .sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1)); // newest first

  return { ok: true, data: summaries };
}

export async function upsertRevenueMonthAllocation(
  businessUnit: string,
  year: number,
  month: number,
  allocations: Array<{ branch: string; amount: number }>
): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (month < 1 || month > 12) return { ok: false, error: "Bulan invalid" };

  for (const a of allocations) {
    if (!a.branch.trim()) return { ok: false, error: "Cabang wajib" };
    if (a.amount < 0)
      return { ok: false, error: "Nominal tidak boleh negatif" };
  }

  const supabase = await createClient();
  // Delete-then-insert per (BU, period). Atomic per request connection.
  const { error: delErr } = await supabase
    .from("revenue_month_allocations")
    .delete()
    .eq("business_unit", businessUnit)
    .eq("period_year", year)
    .eq("period_month", month);
  if (delErr) return { ok: false, error: delErr.message };

  const rows = allocations.filter((a) => a.amount > 0);
  if (rows.length > 0) {
    const { error: insErr } = await supabase
      .from("revenue_month_allocations")
      .insert(
        rows.map((a) => ({
          business_unit: businessUnit,
          period_year: year,
          period_month: month,
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
