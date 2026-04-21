import { sortChronologicalAsc, type ChronoRow } from "./chronological";

/**
 * Latest balance for a rekening, anchored at the earliest row with a
 * stored running_balance and cumulating credit − debit from there on.
 *
 * Shared between the finance landing card and the rekening detail
 * summary so the two views never disagree. The per-row Saldo column
 * in CashflowTable uses the same anchor + cumulation rule, just
 * keyed by row id.
 *
 * For cash rekening with no stored balance anywhere, baseline is 0
 * and the return value is pure net activity (sumCredit − sumDebit).
 */
export function computeLatestBalance<T extends ChronoRow>(rows: T[]): number {
  if (rows.length === 0) return 0;
  const sorted = sortChronologicalAsc(rows);
  const anchorIdx = sorted.findIndex((r) => r.runningBalance != null);
  if (anchorIdx === -1) {
    let net = 0;
    for (const r of sorted) net += r.credit - r.debit;
    return net;
  }
  const anchor = sorted[anchorIdx];
  const anchorBalance = anchor.runningBalance as number;
  // preTx + sum(credit−debit) for rows from the anchor onward.
  // Rows before the anchor are pre-baseline and don't contribute.
  const preTx = anchorBalance - anchor.credit + anchor.debit;
  let netFrom = 0;
  for (let i = anchorIdx; i < sorted.length; i++) {
    netFrom += sorted[i].credit - sorted[i].debit;
  }
  return preTx + netFrom;
}
