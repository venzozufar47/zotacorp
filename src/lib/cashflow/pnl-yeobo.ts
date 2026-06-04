/**
 * PnL aggregator khusus Yeobo Space.
 *
 * Beda dari Haengbocake (lihat pnl.ts):
 *   - Cabang fisik: Tlogosari, Tembalang, Jebres. Tidak ada "Pusat".
 *   - Branch sentinel "All" → auto-split rata 3 cabang, KECUALI
 *     transaksi Salaries & Wages yang punya baris di salary_allocations
 *     (admin breakdown manual per karyawan→cabang→nominal).
 *   - Branch sentinel "Needs Assignment" → flag warning, tidak masuk
 *     branch totals.
 *   - Effective period override (effective_period_month/year)
 *     dihormati persis seperti Haengbocake.
 *
 * Non-operating Yeobo: Wealth Transfer, Investment, Dividend,
 * Owner's Debt, Owner's Debt Repayment (lihat
 * YEOBO_SPACE_NON_OPERATING_CATEGORIES).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  getCategoryPresets,
  getNonOperatingCategories,
  YEOBO_SPACE_BRANCHES,
  YEOBO_TWO_BRANCH_SENTINELS,
} from "./categories";
import {
  splitShares,
  ALL_BRANCH_SENTINEL,
  getPhysicalBranchesForSentinel,
} from "./branch-split";

export type PnLSide = "credit" | "debit";
export type PnLCategoryClass = "operating" | "nonop";

export interface YeoboTxDetail {
  /** Transaction id. Sama untuk semua porsi cabang dari satu tx split —
   *  dipakai konsumen "Semua cabang" untuk men-dedup baris (jumlahkan
   *  porsi kembali jadi nominal penuh, 1 baris per tx). */
  txId: string;
  date: string;
  description: string;
  /** Porsi cabang ini. Positive credit, negative debit. Untuk tx yang
   *  di-split ("All"/sentinel/alokasi gaji) ini hanya bagian cabang
   *  tersebut, bukan nominal penuh. */
  amount: number;
  /** Nominal transaksi PENUH (signed) sebelum di-split. Sama dengan
   *  `amount` untuk tx direct. Dipakai di drill-down audit agar admin
   *  lihat "porsi X dari total Y". Optional → konsumen lama aman. */
  fullAmount?: number;
  /** Info pembagian saat tx ini di-split ke beberapa cabang.
   *  `n` = jumlah cabang penerima, `origin` = nilai branch asli
   *  ("All", "Yeosari + Yeotem", dll). Absent untuk tx direct. */
  branchShare?: { n: number; origin: string };
}

export interface YeoboCategoryBreakdown {
  category: string;
  credit: number;
  debit: number;
  kind: PnLCategoryClass;
  /** Pecahan kontribusi per asal:
   *  - direct  → tx dengan branch eksplisit cabang ini
   *  - allSplit → bagian "All" yang di-split rata
   *  - allocation → bagian dari salary_allocations
   */
  directCredit: number;
  directDebit: number;
  allSplitCredit: number;
  allSplitDebit: number;
  allocationCredit: number;
  allocationDebit: number;
  details?: YeoboTxDetail[];
}

export interface YeoboBranchPnL {
  operatingRevenue: number;
  operatingExpense: number;
  operatingProfit: number;
  nonOpRevenue: number;
  nonOpExpense: number;
  byCategory: YeoboCategoryBreakdown[];
}

export interface YeoboPnLMonth {
  year: number;
  month: number;
  /** Per cabang fisik. Key adalah nama cabang. */
  byBranch: Record<string, YeoboBranchPnL>;
  /**
   * Tx Salaries & Wages branch=All — apakah sudah dialokasi penuh,
   * partial, atau belum sama sekali. Admin pakai ini sbg checklist.
   */
  salaryAllocationStatus: {
    totalTx: number;
    fullyAllocated: number;
    partiallyAllocated: number;
    unallocated: number;
  };
  /** Tx dengan branch="Needs Assignment" yang belum di-resolve. */
  needsAssignmentCount: number;
}

export interface YeoboPnLReport {
  businessUnit: "Yeobo Space";
  from: { year: number; month: number };
  to: { year: number; month: number };
  branches: string[];
  months: YeoboPnLMonth[];
}

function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthsBetween(
  start: { year: number; month: number },
  end: { year: number; month: number }
): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let y = start.year;
  let m = start.month;
  while (y < end.year || (y === end.year && m <= end.month)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// Cabang fisik = bukan "All", bukan sentinel 2-cabang. "Needs Assignment"
// adalah category sentinel (bukan branch di YEOBO_SPACE_BRANCHES) jadi
// tidak perlu di-exclude di filter ini.
const TWO_BRANCH_SENTINEL_SET = new Set<string>(
  Object.keys(YEOBO_TWO_BRANCH_SENTINELS)
);
const PHYSICAL_BRANCHES = YEOBO_SPACE_BRANCHES.filter(
  (b) => b !== ALL_BRANCH_SENTINEL && !TWO_BRANCH_SENTINEL_SET.has(b)
) as readonly string[];

export async function fetchYeoboPnL(
  supabase: SupabaseClient<Database>,
  from: { year: number; month: number },
  to: { year: number; month: number }
): Promise<YeoboPnLReport> {
  type TxRow = {
    id: string;
    transaction_date: string;
    effective_period_year: number | null;
    effective_period_month: number | null;
    debit: string | number;
    credit: string | number;
    category: string | null;
    branch: string | null;
    description: string | null;
  };

  // Pull all Yeobo Space tx (paginate to bypass 1000-row cap).
  const txs: TxRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("cashflow_transactions")
      .select(
        "id, transaction_date, effective_period_year, effective_period_month, debit, credit, category, branch, description, cashflow_statements!inner(bank_accounts!inner(business_unit))"
      )
      .eq("cashflow_statements.bank_accounts.business_unit", "Yeobo Space")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as TxRow[];
    txs.push(...rows);
    if (rows.length < PAGE) break;
  }

  // Fetch salary allocations for tx IDs we'll consider (filter to
  // category Salaries & Wages branch=All first untuk hemat query).
  const allTxIdsSalaryAll = txs
    .filter((t) => t.category === "Salaries & Wages" && t.branch === "All")
    .map((t) => t.id);
  const allocsByTxId = new Map<
    string,
    Array<{ branch: string; amount: number }>
  >();
  if (allTxIdsSalaryAll.length > 0) {
    const { data: allocs } = await supabase
      .from("salary_allocations")
      .select("transaction_id, branch, amount")
      .in("transaction_id", allTxIdsSalaryAll);
    for (const a of allocs ?? []) {
      const list = allocsByTxId.get(a.transaction_id) ?? [];
      list.push({ branch: a.branch, amount: Number(a.amount) });
      allocsByTxId.set(a.transaction_id, list);
    }
  }

  // Fetch MONTHLY revenue allocations (admin membagi total revenue
  // branch=All tiap bulan ke cabang). Build per-month ratio map:
  // ratio_branch = amount_branch / Σamount. Diterapkan ke tiap tx
  // operating-revenue branch=All bulan itu → split proporsional
  // (drift-proof; selalu pas dengan revenue aktual).
  const revenueRatioByMonth = new Map<string, Map<string, number>>();
  {
    const { data: monthAllocs } = await supabase
      .from("revenue_month_allocations")
      .select("period_year, period_month, branch, amount")
      .eq("business_unit", "Yeobo Space");
    const rawByMonth = new Map<string, Array<{ branch: string; amount: number }>>();
    for (const a of monthAllocs ?? []) {
      const key = ym(a.period_year, a.period_month);
      const list = rawByMonth.get(key) ?? [];
      list.push({ branch: a.branch, amount: Number(a.amount) });
      rawByMonth.set(key, list);
    }
    for (const [key, list] of rawByMonth) {
      const sum = list.reduce((s, a) => s + a.amount, 0);
      if (sum <= 0) continue;
      const ratio = new Map<string, number>();
      for (const a of list) ratio.set(a.branch, a.amount / sum);
      revenueRatioByMonth.set(key, ratio);
    }
  }

  const nonOpSet = new Set(getNonOperatingCategories("Yeobo Space"));
  const presets = getCategoryPresets("Yeobo Space");
  const debitCatSet = new Set(presets.debit);
  const creditCatSet = new Set(presets.credit);
  // Operating-credit categories (Revenue + Other Revenue) — eligible for
  // manual per-branch revenue allocation instead of auto-split.
  const operatingCreditSet = new Set(
    presets.credit.filter((c) => !nonOpSet.has(c))
  );
  const rangeMonths = monthsBetween(from, to);

  // Bucket per (monthKey | branch | category | source) → { credit, debit }
  type Bucket = Map<
    string,
    {
      credit: number;
      debit: number;
      details: YeoboTxDetail[];
    }
  >;
  const newBucket = (): Bucket => new Map();
  const sourceBuckets: Record<
    "direct" | "allSplit" | "allocation",
    Bucket
  > = {
    direct: newBucket(),
    allSplit: newBucket(),
    allocation: newBucket(),
  };

  const salaryStatusPerMonth = new Map<
    string,
    { totalTx: number; full: number; partial: number; un: number }
  >();
  const needsAssignmentPerMonth = new Map<string, number>();

  const inRange = (y: number, m: number) => {
    if (y < from.year || y > to.year) return false;
    if (y === from.year && m < from.month) return false;
    if (y === to.year && m > to.month) return false;
    return true;
  };

  const addToBucket = (
    bucket: Bucket,
    monthKey: string,
    branch: string,
    category: string,
    credit: number,
    debit: number,
    detail: YeoboTxDetail | null
  ) => {
    const key = `${monthKey}|${branch}|${category}`;
    const existing = bucket.get(key) ?? {
      credit: 0,
      debit: 0,
      details: [],
    };
    existing.credit += credit;
    existing.debit += debit;
    if (detail) existing.details.push(detail);
    bucket.set(key, existing);
  };

  for (const t of txs) {
    let year: number;
    let month: number;
    if (t.effective_period_year != null && t.effective_period_month != null) {
      year = t.effective_period_year;
      month = t.effective_period_month;
    } else {
      const [y, mStr] = t.transaction_date.split("-");
      year = Number(y);
      month = Number(mStr);
    }
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
    if (!inRange(year, month)) continue;

    const monthKey = ym(year, month);
    const category = (t.category ?? "").trim() || "(tanpa kategori)";
    const branchRaw = (t.branch ?? "").trim();
    const debit = Number(t.debit) || 0;
    const credit = Number(t.credit) || 0;
    if (credit === 0 && debit === 0) continue;

    const fullSigned = credit > 0 ? credit : -debit;
    const detail: YeoboTxDetail = {
      txId: t.id,
      date: t.transaction_date,
      description: (t.description ?? "").trim() || "(tanpa deskripsi)",
      amount: fullSigned,
      fullAmount: fullSigned,
    };

    // Build a per-branch detail for a split tx: same date/description but
    // the branch's PORTION as `amount`, the full tx value as `fullAmount`,
    // plus how it was split (n branches, origin = original branch value).
    // Used so each branch's drill-down shows accurate, audit-complete rows.
    const splitDetail = (
      portionCredit: number,
      portionDebit: number,
      n: number,
      origin: string
    ): YeoboTxDetail => ({
      txId: t.id,
      date: t.transaction_date,
      description: (t.description ?? "").trim() || "(tanpa deskripsi)",
      amount: portionCredit > 0 ? portionCredit : -portionDebit,
      fullAmount: fullSigned,
      branchShare: { n, origin },
    });

    // Track Needs Assignment per month
    if (branchRaw === "Needs Assignment" || category === "Needs Assignment") {
      needsAssignmentPerMonth.set(
        monthKey,
        (needsAssignmentPerMonth.get(monthKey) ?? 0) + 1
      );
      // Tetap masuk bucket "unassigned" branch sintetis supaya muncul
      // di total kategori (kalau admin pingin lihat), tapi tidak masuk
      // branch fisik.
      continue;
    }

    if (PHYSICAL_BRANCHES.includes(branchRaw)) {
      addToBucket(sourceBuckets.direct, monthKey, branchRaw, category, credit, debit, detail);
      continue;
    }

    // Sentinel: "All" (3 cabang) atau 2-cabang sentinel ("Yeosari + Yeotem" dll).
    // Helper resolve ke daftar physical branch tujuan split.
    const physicalForThisTx = getPhysicalBranchesForSentinel(
      branchRaw,
      "Yeobo Space"
    );
    if (physicalForThisTx && physicalForThisTx.length > 0) {
      const splitN = physicalForThisTx.length;

      // Special handling: Salaries & Wages w/ allocations?
      if (category === "Salaries & Wages") {
        const allocs = allocsByTxId.get(t.id) ?? [];
        const allocatedTotal = allocs.reduce((s, a) => s + a.amount, 0);
        const status = salaryStatusPerMonth.get(monthKey) ?? {
          totalTx: 0,
          full: 0,
          partial: 0,
          un: 0,
        };
        status.totalTx += 1;
        if (allocs.length === 0) {
          status.un += 1;
        } else if (Math.abs(allocatedTotal - debit) <= 1) {
          status.full += 1;
        } else {
          status.partial += 1;
        }
        salaryStatusPerMonth.set(monthKey, status);

        if (allocs.length > 0) {
          // Use allocations untuk porsi yang dialokasikan, sisanya
          // auto-split rata sesuai sentinel asal (3 cabang utk "All",
          // 2 cabang utk sentinel 2-cabang).
          for (const a of allocs) {
            // Allocation row sendiri bisa pakai sentinel (mis. admin
            // alokasi 1 karyawan ke "Yeosari + Yeotem" Rp 5jt → 50/50).
            const allocPhysical = getPhysicalBranchesForSentinel(
              a.branch,
              "Yeobo Space"
            );
            if (allocPhysical && allocPhysical.length > 0) {
              const shares = splitShares(
                Math.round(a.amount),
                allocPhysical.length
              );
              allocPhysical.forEach((b, i) => {
                const c = credit > 0 ? shares[i] : 0;
                const d = debit > 0 ? shares[i] : 0;
                addToBucket(
                  sourceBuckets.allocation,
                  monthKey,
                  b,
                  category,
                  c,
                  d,
                  splitDetail(c, d, allocPhysical.length, `alokasi: ${a.branch}`)
                );
              });
            } else if (PHYSICAL_BRANCHES.includes(a.branch)) {
              const c = credit > 0 ? a.amount : 0;
              const d = debit > 0 ? a.amount : 0;
              addToBucket(
                sourceBuckets.allocation,
                monthKey,
                a.branch,
                category,
                c,
                d,
                splitDetail(c, d, 1, `alokasi: ${a.branch}`)
              );
            }
            // Branch "Needs Assignment" pada allocation = admin tunda
            // pilih cabang; treat as unallocated (tidak masuk branch).
          }
          // Sisa yang tidak teralokasi → auto-split rata ke physical
          // sesuai sentinel asal.
          const remaining = debit - allocatedTotal;
          if (remaining > 0.01) {
            const shares = splitShares(Math.round(remaining), splitN);
            physicalForThisTx.forEach((b, i) => {
              addToBucket(
                sourceBuckets.allSplit,
                monthKey,
                b,
                category,
                0,
                shares[i],
                splitDetail(0, shares[i], splitN, `${branchRaw} (sisa)`)
              );
            });
          }
          continue;
        }
      }

      // Operating-revenue branch=All dengan alokasi BULANAN? Bagi tx ini
      // proporsional ke cabang sesuai ratio bulan tsb (amount_b / Σ).
      // Kalau bulan belum dialokasi → jatuh ke auto-split 1/3 di bawah.
      if (operatingCreditSet.has(category) && credit > 0) {
        const ratio = revenueRatioByMonth.get(monthKey);
        if (ratio && ratio.size > 0) {
          const physicalRatios = [...ratio.entries()].filter(([b]) =>
            PHYSICAL_BRANCHES.includes(b)
          );
          if (physicalRatios.length > 0) {
            const total = Math.round(credit);
            let assigned = 0;
            physicalRatios.forEach(([b, r], i) => {
              const share =
                i === physicalRatios.length - 1
                  ? total - assigned // sisa ke cabang terakhir → sum pas
                  : Math.round(total * r);
              assigned += share;
              addToBucket(
                sourceBuckets.allocation,
                monthKey,
                b,
                category,
                share,
                0,
                splitDetail(
                  share,
                  0,
                  physicalRatios.length,
                  `${branchRaw} (alokasi proporsi)`
                )
              );
            });
            continue;
          }
        }
        // Belum ada alokasi bulan ini → auto-split fallback di bawah.
      }

      // Default: auto-split rata sesuai jumlah cabang sentinel (2 atau 3).
      const debitShares = splitShares(Math.round(debit), splitN);
      const creditShares = splitShares(Math.round(credit), splitN);
      physicalForThisTx.forEach((b, i) => {
        addToBucket(
          sourceBuckets.allSplit,
          monthKey,
          b,
          category,
          creditShares[i],
          debitShares[i],
          // Detail dilampirkan ke SETIAP cabang penerima split (porsi
          // masing-masing) supaya drill-down audit per-cabang lengkap —
          // tiap baris menandai "dibagi N" + porsi vs nominal penuh.
          splitDetail(creditShares[i], debitShares[i], splitN, branchRaw)
        );
      });
      continue;
    }

    // Branch lain (legacy values atau typo) → direct attribution apa adanya
    addToBucket(sourceBuckets.direct, monthKey, branchRaw || "(tanpa cabang)", category, credit, debit, detail);
  }

  // Build per-month reports.
  const months: YeoboPnLMonth[] = rangeMonths.map(({ year, month }) => {
    const monthKey = ym(year, month);
    const byBranch: Record<string, YeoboBranchPnL> = {};

    for (const branch of PHYSICAL_BRANCHES) {
      const byCategory: YeoboCategoryBreakdown[] = [];
      let opRev = 0;
      let opExp = 0;
      let nopRev = 0;
      let nopExp = 0;

      // Collect categories present in any source bucket for this branch.
      const categoriesSet = new Set<string>();
      for (const src of ["direct", "allSplit", "allocation"] as const) {
        for (const k of sourceBuckets[src].keys()) {
          const [mk, br, cat] = k.split("|");
          if (mk === monthKey && br === branch) categoriesSet.add(cat);
        }
      }

      for (const category of categoriesSet) {
        const direct = sourceBuckets.direct.get(`${monthKey}|${branch}|${category}`);
        const allSplit = sourceBuckets.allSplit.get(`${monthKey}|${branch}|${category}`);
        const allocation = sourceBuckets.allocation.get(`${monthKey}|${branch}|${category}`);

        const credit =
          (direct?.credit ?? 0) +
          (allSplit?.credit ?? 0) +
          (allocation?.credit ?? 0);
        const debit =
          (direct?.debit ?? 0) +
          (allSplit?.debit ?? 0) +
          (allocation?.debit ?? 0);

        const isNonOp = nonOpSet.has(category);
        const isExpense = debitCatSet.has(category);
        const isRevenue = creditCatSet.has(category);

        let netCredit = credit;
        let netDebit = debit;
        // NET sisi berlawanan untuk operating expense/revenue.
        if (!isNonOp) {
          if (isExpense && !isRevenue) {
            netDebit = debit - credit;
            netCredit = 0;
          } else if (isRevenue && !isExpense) {
            netCredit = credit - debit;
            netDebit = 0;
          }
        }

        const details: YeoboTxDetail[] = [];
        if (direct?.details) details.push(...direct.details);
        if (allSplit?.details) details.push(...allSplit.details);
        if (allocation?.details) details.push(...allocation.details);
        details.sort((a, b) => a.date.localeCompare(b.date));

        const row: YeoboCategoryBreakdown = {
          category,
          credit: Math.round(netCredit),
          debit: Math.round(netDebit),
          kind: isNonOp ? "nonop" : "operating",
          directCredit: Math.round(direct?.credit ?? 0),
          directDebit: Math.round(direct?.debit ?? 0),
          allSplitCredit: Math.round(allSplit?.credit ?? 0),
          allSplitDebit: Math.round(allSplit?.debit ?? 0),
          allocationCredit: Math.round(allocation?.credit ?? 0),
          allocationDebit: Math.round(allocation?.debit ?? 0),
          details: details.length > 0 ? details : undefined,
        };
        byCategory.push(row);

        if (isNonOp) {
          nopRev += row.credit;
          nopExp += row.debit;
        } else {
          opRev += row.credit;
          opExp += row.debit;
        }
      }

      byCategory.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "operating" ? -1 : 1;
        return Math.max(b.credit, b.debit) - Math.max(a.credit, a.debit);
      });

      byBranch[branch] = {
        operatingRevenue: Math.round(opRev),
        operatingExpense: Math.round(opExp),
        operatingProfit: Math.round(opRev - opExp),
        nonOpRevenue: Math.round(nopRev),
        nonOpExpense: Math.round(nopExp),
        byCategory,
      };
    }

    const status = salaryStatusPerMonth.get(monthKey) ?? {
      totalTx: 0,
      full: 0,
      partial: 0,
      un: 0,
    };

    return {
      year,
      month,
      byBranch,
      salaryAllocationStatus: {
        totalTx: status.totalTx,
        fullyAllocated: status.full,
        partiallyAllocated: status.partial,
        unallocated: status.un,
      },
      needsAssignmentCount: needsAssignmentPerMonth.get(monthKey) ?? 0,
    };
  });

  return {
    businessUnit: "Yeobo Space",
    from,
    to,
    branches: PHYSICAL_BRANCHES.slice(),
    months,
  };
}
