/**
 * Profit & Loss aggregation for a business unit.
 *
 * Scope rules (as requested by user):
 *   - Only transactions from Bank **Jago** accounts under the BU are
 *     counted. Mandiri accounts are a pass-through for QRIS revenue
 *     that's already moved to Jago; including them would double-count.
 *   - Three branches exist (Pusat, Semarang, Pare) but Pusat is NOT
 *     operating. Admin must allocate every Pusat (month × category ×
 *     side) bucket into a Semarang + Pare split. Unallocated or
 *     unbalanced buckets are EXCLUDED from branch numbers and flagged
 *     as warnings.
 *   - "Wealth Transfer", "Investment", "Dividend" are classified
 *     non-operating (see `getNonOperatingCategories`) and don't
 *     contribute to the operating-profit line. They appear in their
 *     own summary row ("Aktivitas Lain").
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getNonOperatingCategories } from "./categories";

export type PnLSide = "credit" | "debit";
export type PnLCategoryClass = "operating" | "nonop";

export interface BranchCategoryBreakdown {
  category: string;
  credit: number;
  debit: number;
  kind: PnLCategoryClass;
}

export interface BranchPnL {
  operatingRevenue: number;
  operatingExpense: number;
  operatingProfit: number;
  nonOpRevenue: number;
  nonOpExpense: number;
  netCashFlow: number; // operatingProfit + (nonOpRevenue - nonOpExpense)
  byCategory: BranchCategoryBreakdown[];
}

export interface PusatBreakdownRow {
  category: string;
  side: PnLSide;
  pusatTotal: number;
  semarangAlloc: number;
  pareAlloc: number;
  balanced: boolean;
  /** No allocation row yet in DB. */
  unallocated: boolean;
  /** Has a row but sum ≠ pusatTotal. */
  unbalanced: boolean;
}

export interface PnLMonth {
  year: number;
  month: number;
  byBranch: {
    Semarang: BranchPnL;
    Pare: BranchPnL;
  };
  pusatBreakdown: PusatBreakdownRow[];
  /** Count of Pusat buckets still needing admin input this month. */
  unallocatedCount: number;
  unbalancedCount: number;
}

export interface PnLReport {
  businessUnit: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
  months: PnLMonth[];
}

/** { year, month } in the range [start..end] inclusive, chronological. */
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

function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Produce a full PnL report for the BU across the given month range.
 * Pure function beyond two DB queries — safe to call from server
 * components or server actions.
 */
export async function fetchPnL(
  supabase: SupabaseClient<Database>,
  businessUnit: string,
  from: { year: number; month: number },
  to: { year: number; month: number }
): Promise<PnLReport> {
  const startDate = `${from.year}-${String(from.month).padStart(2, "0")}-01`;
  // To-date is last day of to-month. Using first day of the following
  // month minus 1 day at query time to avoid month-length math.
  const afterTo =
    to.month === 12
      ? `${to.year + 1}-01-01`
      : `${to.year}-${String(to.month + 1).padStart(2, "0")}-01`;

  // Join chain filters tx to this BU's Jago accounts only.
  const { data: txs } = await supabase
    .from("cashflow_transactions")
    .select(
      "transaction_date, debit, credit, category, branch, cashflow_statements!inner(bank_account_id, bank_accounts!inner(business_unit, bank))"
    )
    .eq("cashflow_statements.bank_accounts.business_unit", businessUnit)
    .eq("cashflow_statements.bank_accounts.bank", "jago")
    .gte("transaction_date", startDate)
    .lt("transaction_date", afterTo);

  const { data: allocsRaw } = await supabase
    .from("cashflow_pusat_allocations")
    .select(
      "period_year, period_month, side, category, semarang_amount, pare_amount"
    )
    .eq("business_unit", businessUnit)
    .gte("period_year", from.year)
    .lte("period_year", to.year);

  // allocs keyed by "year-month|side|category"
  const allocMap = new Map<
    string,
    { semarang: number; pare: number }
  >();
  for (const a of allocsRaw ?? []) {
    const key = `${ym(a.period_year, a.period_month)}|${a.side}|${a.category}`;
    allocMap.set(key, {
      semarang: Number(a.semarang_amount),
      pare: Number(a.pare_amount),
    });
  }

  // Aggregate tx totals: (monthKey, branch, category, side) → amount
  type AggKey = {
    monthKey: string;
    branch: "Pusat" | "Semarang" | "Pare" | "unassigned";
    category: string;
    side: PnLSide;
  };
  const txTotals = new Map<string, number>();
  function keyOf(k: AggKey): string {
    return `${k.monthKey}|${k.branch}|${k.category}|${k.side}`;
  }

  for (const t of (txs ?? []) as Array<{
    transaction_date: string;
    debit: string | number;
    credit: string | number;
    category: string | null;
    branch: string | null;
  }>) {
    const [y, mStr] = t.transaction_date.split("-");
    const year = Number(y);
    const month = Number(mStr);
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;

    const monthKey = ym(year, month);
    const branchRaw = (t.branch ?? "").trim();
    const branch: AggKey["branch"] =
      branchRaw === "Pusat" || branchRaw === "Semarang" || branchRaw === "Pare"
        ? branchRaw
        : "unassigned";
    const category = (t.category ?? "").trim() || "(tanpa kategori)";

    const debit = Number(t.debit) || 0;
    const credit = Number(t.credit) || 0;
    if (credit > 0) {
      const k = keyOf({ monthKey, branch, category, side: "credit" });
      txTotals.set(k, (txTotals.get(k) ?? 0) + credit);
    }
    if (debit > 0) {
      const k = keyOf({ monthKey, branch, category, side: "debit" });
      txTotals.set(k, (txTotals.get(k) ?? 0) + debit);
    }
  }

  const nonOpSet = new Set(getNonOperatingCategories(businessUnit));
  const rangeMonths = monthsBetween(from, to);

  // Build per-month report.
  const months: PnLMonth[] = rangeMonths.map(({ year, month }) => {
    const monthKey = ym(year, month);

    // Start empty branch buckets.
    const branchAgg: Record<
      "Semarang" | "Pare",
      Map<string, { credit: number; debit: number }>
    > = {
      Semarang: new Map(),
      Pare: new Map(),
    };
    const addToBranch = (
      branch: "Semarang" | "Pare",
      category: string,
      credit: number,
      debit: number
    ) => {
      const existing = branchAgg[branch].get(category) ?? {
        credit: 0,
        debit: 0,
      };
      existing.credit += credit;
      existing.debit += debit;
      branchAgg[branch].set(category, existing);
    };

    // 1. Direct branch tx: iterate all (category, side) combinations
    //    for this month's direct-branch rows.
    for (const [k, amount] of txTotals) {
      const [mk, branch, category, side] = k.split("|") as [
        string,
        AggKey["branch"],
        string,
        PnLSide,
      ];
      if (mk !== monthKey) continue;
      if (branch !== "Semarang" && branch !== "Pare") continue;
      if (side === "credit") addToBranch(branch, category, amount, 0);
      else addToBranch(branch, category, 0, amount);
    }

    // 2. Pusat buckets: merge with allocation. Balanced allocations
    //    contribute to the branch totals; unbalanced/unallocated are
    //    skipped here and flagged in `pusatBreakdown`.
    const pusatBreakdown: PusatBreakdownRow[] = [];
    const pusatCategories = new Set<string>();
    for (const [k, amount] of txTotals) {
      const [mk, branch, category, side] = k.split("|") as [
        string,
        AggKey["branch"],
        string,
        PnLSide,
      ];
      if (mk !== monthKey || branch !== "Pusat") continue;
      const allocKey = `${monthKey}|${side}|${category}`;
      const alloc = allocMap.get(allocKey);
      const pusatTotal = Math.round(amount);
      const semarangAlloc = alloc ? Math.round(alloc.semarang) : 0;
      const pareAlloc = alloc ? Math.round(alloc.pare) : 0;
      const sum = semarangAlloc + pareAlloc;
      const unallocated = !alloc;
      const balanced = !unallocated && Math.abs(sum - pusatTotal) <= 1;
      const unbalanced = !unallocated && !balanced;

      pusatBreakdown.push({
        category,
        side,
        pusatTotal,
        semarangAlloc,
        pareAlloc,
        balanced,
        unallocated,
        unbalanced,
      });
      pusatCategories.add(`${category}|${side}`);

      if (balanced) {
        if (side === "credit") {
          addToBranch("Semarang", category, semarangAlloc, 0);
          addToBranch("Pare", category, pareAlloc, 0);
        } else {
          addToBranch("Semarang", category, 0, semarangAlloc);
          addToBranch("Pare", category, 0, pareAlloc);
        }
      }
    }

    // Sort pusatBreakdown consistently for stable rendering.
    pusatBreakdown.sort((a, b) => {
      if (a.side !== b.side) return a.side === "credit" ? -1 : 1;
      return a.category.localeCompare(b.category);
    });

    // 3. Summarize each branch.
    const buildBranch = (
      bag: Map<string, { credit: number; debit: number }>
    ): BranchPnL => {
      const byCategory: BranchCategoryBreakdown[] = [];
      let opRev = 0;
      let opExp = 0;
      let nopRev = 0;
      let nopExp = 0;
      for (const [category, totals] of bag) {
        const isNonOp = nonOpSet.has(category);
        byCategory.push({
          category,
          credit: Math.round(totals.credit),
          debit: Math.round(totals.debit),
          kind: isNonOp ? "nonop" : "operating",
        });
        if (isNonOp) {
          nopRev += totals.credit;
          nopExp += totals.debit;
        } else {
          opRev += totals.credit;
          opExp += totals.debit;
        }
      }
      byCategory.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "operating" ? -1 : 1;
        const aTotal = Math.max(a.credit, a.debit);
        const bTotal = Math.max(b.credit, b.debit);
        return bTotal - aTotal;
      });
      return {
        operatingRevenue: Math.round(opRev),
        operatingExpense: Math.round(opExp),
        operatingProfit: Math.round(opRev - opExp),
        nonOpRevenue: Math.round(nopRev),
        nonOpExpense: Math.round(nopExp),
        netCashFlow: Math.round(opRev - opExp + nopRev - nopExp),
        byCategory,
      };
    };

    return {
      year,
      month,
      byBranch: {
        Semarang: buildBranch(branchAgg.Semarang),
        Pare: buildBranch(branchAgg.Pare),
      },
      pusatBreakdown,
      unallocatedCount: pusatBreakdown.filter((p) => p.unallocated).length,
      unbalancedCount: pusatBreakdown.filter((p) => p.unbalanced).length,
    };
  });

  return {
    businessUnit,
    from,
    to,
    months,
  };
}
