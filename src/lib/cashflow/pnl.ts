/**
 * Profit & Loss aggregation for a business unit.
 *
 * Scope rules:
 *   - Pulls transactions from ALL rekening (bank + cash) under the
 *     BU. Inter-account transfers are classified as "Wealth Transfer"
 *     (non-operating) so they wash out — no double-count. Cash-ledger
 *     category labels are normalized to the unified PnL vocabulary
 *     via `normalizePnLCategory` (e.g. "Haengbo Cust" → "Sales").
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
import { getNonOperatingCategories, normalizePnLCategory } from "./categories";

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
  /**
   * Net dividend from the owner's perspective — this IS the owner's
   * profit line. Money leaving the business as dividend/payouts
   * (debit) counts positive; money the owner puts in (Investment,
   * credit) counts negative. Wealth Transfer is excluded because it's
   * just a reshuffle between owned accounts — not a real dividend.
   *
   * Note: "Operating Profit" (revenue − expense) is the BUSINESS's
   * performance, not the owner's profit. Dividend is how that
   * business profit is distributed to the owner. Don't combine them
   * into a single "total" — they're two separate views.
   */
  netDividen: number;
  byCategory: BranchCategoryBreakdown[];
}

/**
 * Non-operating categories excluded from Net Dividen (treated as
 * neutral wash). Wealth Transfer = reshuffle between owned accounts.
 * Pinjaman / Pinjaman Mamaya = borrow/repay cash, not owner profit
 * or capital injection.
 */
const NET_DIVIDEN_EXCLUDED = new Set([
  "Wealth Transfer",
  "Pinjaman",
  "Pinjaman Mamaya",
]);

export interface PusatTxDetail {
  date: string;
  description: string;
  amount: number;
}

/**
 * Categories where admin wants to see the underlying Pusat
 * transactions inline in the allocation editor (not just the
 * aggregate). Useful for catch-all buckets like "Other Revenue"
 * where the reason to allocate depends on the individual source.
 */
export const PUSAT_DETAIL_CATEGORIES = new Set([
  "Other Revenue",
  "Salaries & Wages",
]);

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
  /** Populated only for categories in PUSAT_DETAIL_CATEGORIES. */
  details?: PusatTxDetail[];
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
  // Pull tx from ALL rekening for the BU (bank + cash). Inter-account
  // transfers are classified as "Wealth Transfer" (non-operating) so
  // they wash out in operating totals — no double-count. Cash
  // rekening uses different category labels (Haengbo Cust, Slice
  // Haengbo, etc.); we normalize them via `normalizePnLCategory` to
  // the unified PnL vocabulary so a single "Sales" bucket aggregates
  // all revenue sources.
  // Paginate to bypass PostgREST's default 1000-row cap. `.range()`
  // alone isn't reliable on managed Supabase because `db-max-rows`
  // can be enforced server-side regardless of the Range header. Loop
  // until we read a short page.
  type PnLTxRow = {
    transaction_date: string;
    effective_period_year: number | null;
    effective_period_month: number | null;
    debit: string | number;
    credit: string | number;
    category: string | null;
    branch: string | null;
    description: string | null;
  };
  const txs: PnLTxRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error } = await supabase
      .from("cashflow_transactions")
      .select(
        "transaction_date, effective_period_year, effective_period_month, debit, credit, category, branch, description, cashflow_statements!inner(bank_account_id, bank_accounts!inner(business_unit))"
      )
      .eq("cashflow_statements.bank_accounts.business_unit", businessUnit)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (page ?? []) as PnLTxRow[];
    txs.push(...rows);
    if (rows.length < PAGE) break;
  }

  const { data: allocsRaw } = await supabase
    .from("cashflow_pusat_allocations")
    .select(
      "period_year, period_month, side, category, semarang_amount, pare_amount"
    )
    .eq("business_unit", businessUnit)
    .gte("period_year", from.year)
    .lte("period_year", to.year)
    .range(0, 99999);

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

  // Aggregate tx totals, partitioned by monthKey. This way the
  // per-month report build below is O(buckets_in_month) instead of
  // O(total_tx_across_range) for every month iteration.
  type BranchName = "Pusat" | "Semarang" | "Pare" | "unassigned";
  type MonthBucket = Map<string, number>; // "<branch>|<category>|<side>" → amount
  const byMonth = new Map<string, MonthBucket>();
  // Per-bucket transaction details, only filled for Pusat buckets
  // whose category is in PUSAT_DETAIL_CATEGORIES. Keyed identically
  // to the main bucket map ("monthKey | <branch>|<category>|<side>")
  // so lookup during report-build is a single map hit.
  const detailsByBucket = new Map<string, PusatTxDetail[]>();

  // Inclusive month range check for the effective-bucket filter.
  const inRange = (y: number, m: number): boolean => {
    if (y < from.year || y > to.year) return false;
    if (y === from.year && m < from.month) return false;
    if (y === to.year && m > to.month) return false;
    return true;
  };

  for (const t of txs) {
    // Resolved bucket = override if set, else the tx date's month.
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
    const branchRaw = (t.branch ?? "").trim();
    const branch: BranchName =
      branchRaw === "Pusat" || branchRaw === "Semarang" || branchRaw === "Pare"
        ? branchRaw
        : "unassigned";
    const category = normalizePnLCategory(businessUnit, t.category);

    const debit = Number(t.debit) || 0;
    const credit = Number(t.credit) || 0;
    if (credit === 0 && debit === 0) continue;

    let bucket = byMonth.get(monthKey);
    if (!bucket) {
      bucket = new Map();
      byMonth.set(monthKey, bucket);
    }
    const collectDetail = branch === "Pusat" && PUSAT_DETAIL_CATEGORIES.has(category);
    if (credit > 0) {
      const k = `${branch}|${category}|credit`;
      bucket.set(k, (bucket.get(k) ?? 0) + credit);
      if (collectDetail) {
        const dk = `${monthKey}|${k}`;
        const list = detailsByBucket.get(dk) ?? [];
        list.push({
          date: t.transaction_date,
          description: (t.description ?? "").trim() || "(tanpa deskripsi)",
          amount: credit,
        });
        detailsByBucket.set(dk, list);
      }
    }
    if (debit > 0) {
      const k = `${branch}|${category}|debit`;
      bucket.set(k, (bucket.get(k) ?? 0) + debit);
      if (collectDetail) {
        const dk = `${monthKey}|${k}`;
        const list = detailsByBucket.get(dk) ?? [];
        list.push({
          date: t.transaction_date,
          description: (t.description ?? "").trim() || "(tanpa deskripsi)",
          amount: debit,
        });
        detailsByBucket.set(dk, list);
      }
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

    const bucket = byMonth.get(monthKey) ?? new Map<string, number>();

    // 1. Direct branch tx: iterate this month's partition only.
    for (const [k, amount] of bucket) {
      const [branch, category, side] = k.split("|") as [
        BranchName,
        string,
        PnLSide,
      ];
      if (branch !== "Semarang" && branch !== "Pare") continue;
      if (side === "credit") addToBranch(branch, category, amount, 0);
      else addToBranch(branch, category, 0, amount);
    }

    // 2. Pusat buckets: merge with allocation. Balanced allocations
    //    contribute to the branch totals; unbalanced/unallocated are
    //    skipped here and flagged in `pusatBreakdown`.
    const pusatBreakdown: PusatBreakdownRow[] = [];
    for (const [k, amount] of bucket) {
      const [branch, category, side] = k.split("|") as [
        BranchName,
        string,
        PnLSide,
      ];
      if (branch !== "Pusat") continue;
      const allocKey = `${monthKey}|${side}|${category}`;
      const alloc = allocMap.get(allocKey);
      const pusatTotal = Math.round(amount);
      const semarangAlloc = alloc ? Math.round(alloc.semarang) : 0;
      const pareAlloc = alloc ? Math.round(alloc.pare) : 0;
      const sum = semarangAlloc + pareAlloc;
      const unallocated = !alloc;
      const balanced = !unallocated && Math.abs(sum - pusatTotal) <= 1;
      const unbalanced = !unallocated && !balanced;

      const details = PUSAT_DETAIL_CATEGORIES.has(category)
        ? detailsByBucket
            .get(`${monthKey}|${k}`)
            ?.slice()
            .sort((a, b) => a.date.localeCompare(b.date))
        : undefined;
      pusatBreakdown.push({
        category,
        side,
        pusatTotal,
        semarangAlloc,
        pareAlloc,
        balanced,
        unallocated,
        unbalanced,
        details,
      });

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
      // Net dividen (owner-POV): only counts non-op cats NOT in the
      // excluded set (Wealth Transfer). Signs flipped vs operating:
      // debit = owner receives (+), credit = owner invests (−).
      let netDivDebit = 0;
      let netDivCredit = 0;
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
          if (!NET_DIVIDEN_EXCLUDED.has(category)) {
            netDivDebit += totals.debit;
            netDivCredit += totals.credit;
          }
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
        netDividen: Math.round(netDivDebit - netDivCredit),
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
