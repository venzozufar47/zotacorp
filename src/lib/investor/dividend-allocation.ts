/**
 * Pure helpers for the Yeobo per-investor dividend allocation feature.
 *
 * The monthly "pool" to distribute is the per-branch Dividend figure
 * already present in the PnL report (hardcoded "Dividends & BEP" for
 * 2023-2025, live category='Dividend' for 2026+). The pool is split:
 *   management = pool * mgmtPct  (35% before BEP, 50% after)
 *   investorPool = pool - management
 *   each investor = investorPool * (poolPct / 100)
 * with the rounding remainder absorbed by the last investor so the parts
 * sum exactly to the pool.
 */

import type { YeoboPnLReport } from "@/lib/cashflow/pnl-yeobo";

export interface DivRecipient {
  id: string;
  label: string;
  kind: "management" | "investor";
  /** % within the investor pool; null/0 for management. */
  poolPct: number | null;
  /** Nominal investasi asli. Bila ada, jadi sumber kebenaran fraksi
   *  (investIdr / totalInvestment) — menghindari pembulatan poolPct. */
  investIdr: number | null;
  sortOrder: number;
  userId: string | null;
  contractId: string | null;
}

/** Fraksi investor i terhadap pool investor (pakai nominal investasi
 *  bila ada, jika tidak pakai poolPct). */
export function investorFrac(r: DivRecipient, totalInvestment: number | null): number {
  if (r.investIdr != null && totalInvestment && totalInvestment > 0) {
    return r.investIdr / totalInvestment;
  }
  return (r.poolPct ?? 0) / 100;
}

export interface DivBranchConfig {
  branch: string;
  mgmtPctBeforeBep: number;
  mgmtPctAfterBep: number;
  /** Total modal investor cabang (e.g. Tlogosari 110jt). BEP reached
   *  when cumulative investor-pool payout ≥ this. */
  totalInvestmentIdr: number | null;
  /** Manual override 'YYYY-MM' — when set, month >= this is "after BEP". */
  bepReachedYm: string | null;
}

export interface DivComputedRow {
  recipientId: string;
  amount: number;
}

/** Read the Dividend pool for a branch+month from a PnL report. */
export function getYeoboDividendPool(
  report: YeoboPnLReport,
  branch: string,
  year: number,
  month: number
): number {
  const mo = report.months.find((m) => m.year === year && m.month === month);
  const data = mo?.byBranch[branch];
  if (!data) return 0;
  const div = data.byCategory.find((c) => c.category === "Dividend");
  if (!div) return 0;
  // Dividend is a non-op debit; use the non-zero side defensively.
  return div.debit !== 0 ? div.debit : div.credit;
}

/** Cumulative Dividend pool for a branch from the report's start through (y,m). */
export function cumulativeDividendPool(
  report: YeoboPnLReport,
  branch: string,
  throughYear: number,
  throughMonth: number
): number {
  let sum = 0;
  for (const m of report.months) {
    if (m.year > throughYear || (m.year === throughYear && m.month > throughMonth))
      continue;
    const div = m.byBranch[branch]?.byCategory.find(
      (c) => c.category === "Dividend"
    );
    if (div) sum += div.debit !== 0 ? div.debit : div.credit;
  }
  return sum;
}

/** Investor-pool fraction before BEP, e.g. mgmt 35 → 0.65. */
export function investorPoolFracBeforeBep(config: DivBranchConfig): number {
  return (100 - config.mgmtPctBeforeBep) / 100;
}

/**
 * Is the branch "after BEP" for the given month? Manual override wins.
 * Otherwise: the investors collectively recoup their capital when the
 * cumulative investor-pool payout reaches total investment. Before BEP the
 * investor pool gets `investorPoolFracBeforeBep` of each month's dividend,
 * so cumulative investor payout for the months BEFORE this one ==
 * frac × cumulativeDividendBeforeMonth. The month that crosses the target
 * is still "before"; the next month onward is "after".
 */
export function isBranchAfterBep(args: {
  config: DivBranchConfig;
  cumulativeDividendBeforeMonth: number;
  year: number;
  month: number;
}): boolean {
  const { config, cumulativeDividendBeforeMonth, year, month } = args;
  if (config.bepReachedYm) {
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    return ym >= config.bepReachedYm;
  }
  const total = config.totalInvestmentIdr;
  if (total != null && total > 0) {
    const investorPaid =
      investorPoolFracBeforeBep(config) * cumulativeDividendBeforeMonth;
    return investorPaid >= total;
  }
  return false;
}

export interface RecipientAmount {
  recipientId: string;
  label: string;
  kind: "management" | "investor";
  poolPct: number | null;
  amount: number;
}

/**
 * Split a pool across recipients. Each investor gets
 * `investorPoolFrac × poolPct` of the dividend, where `investorPoolFrac`
 * = (100 − mgmtPct)/100 (0.65 before BEP, 0.50 after). **Management is the
 * RESIDUAL** (pool − Σ investors), so it absorbs rounding AND any
 * over/under-subscription of the investor pool:
 *   - Σ poolPct = 100% → investors take exactly investorPoolFrac,
 *     management = mgmtPct (e.g. Tlogosari/Tembalang 35/65 → mgmt 35%).
 *   - Σ poolPct = 110% (Jebres: extra investor) → investors take
 *     0.65×1.10 = 71.5%, management "dikorbankan" to 28.5%.
 * Σ(amounts) === round(pool) exactly.
 */
export function computeRecipientAmounts(args: {
  pool: number;
  afterBep: boolean;
  config: DivBranchConfig;
  recipients: DivRecipient[];
}): RecipientAmount[] {
  const { pool, afterBep, config, recipients } = args;
  const poolR = Math.round(pool);
  const mgmtPct = afterBep ? config.mgmtPctAfterBep : config.mgmtPctBeforeBep;
  const investorPoolFrac = (100 - mgmtPct) / 100;

  const ordered = [...recipients].sort((a, b) => a.sortOrder - b.sortOrder);

  const out: RecipientAmount[] = [];
  let investorTotal = 0;
  for (const r of ordered) {
    if (r.kind !== "investor") continue;
    const amt = Math.round(
      poolR * investorPoolFrac * investorFrac(r, config.totalInvestmentIdr)
    );
    investorTotal += amt;
    out.push({
      recipientId: r.id,
      label: r.label,
      kind: "investor",
      poolPct: r.poolPct,
      amount: amt,
    });
  }

  // Management = residual (sisa). Sacrificed when investor pool > 100%.
  const mgmtAmount = poolR - investorTotal;
  for (const r of ordered) {
    if (r.kind !== "management") continue;
    out.push({
      recipientId: r.id,
      label: r.label,
      kind: "management",
      poolPct: null,
      amount: mgmtAmount,
    });
  }

  // Return in the recipients' sort order.
  const byId = new Map(out.map((o) => [o.recipientId, o]));
  return ordered.map((r) => byId.get(r.id)!).filter(Boolean);
}
