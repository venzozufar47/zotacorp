/**
 * Chronological ordering helpers for cashflow transactions.
 *
 * Bank statements print in time order, but two rows can share the
 * same minute (e.g. a pocket transfer + its counterpart debit). When
 * the timestamps tie, we can't rely on time alone — we read the
 * balance chain instead:
 *
 *     B comes AFTER A  iff  A.runningBalance === B.runningBalance − B.credit + B.debit
 *                          (i.e. B's "before" equals A's "after")
 *
 * Both sides of the feature use this:
 *   - The Gemini parser, to fix intra-minute ordering before rows get
 *     a sort_order assigned at commit.
 *   - The rekening detail page, to display existing rows correctly
 *     even if sort_order was written in the wrong order.
 */

export interface ChronoRow {
  date: string; // YYYY-MM-DD
  time?: string | null;
  debit: number;
  credit: number;
  runningBalance?: number | null;
}

/**
 * Given rows that all share the same (date, time), return them in
 * chronological order (oldest first). Falls back to input order if
 * the balance chain is ambiguous (any row missing a balance, or no
 * consistent start / cycle detected).
 */
function sortTiedGroup<T extends ChronoRow>(group: T[]): T[] {
  if (group.length < 2) return group;
  // Every row must have a finite running balance for the chain to
  // work. Any gap and we bail.
  for (const r of group) {
    if (r.runningBalance == null || !Number.isFinite(r.runningBalance)) {
      return group;
    }
  }
  // For each row, compute what the balance was BEFORE it applied.
  const rowsWithBefore = group.map((r) => ({
    row: r,
    before: (r.runningBalance as number) - r.credit + r.debit,
    after: r.runningBalance as number,
  }));
  // Map from "after" balance → index of the row that produced it.
  // If two rows somehow end at the same balance, the chain is
  // ambiguous; give up.
  const afterToIdx = new Map<number, number>();
  for (let i = 0; i < rowsWithBefore.length; i++) {
    const a = rowsWithBefore[i].after;
    if (afterToIdx.has(a)) return group;
    afterToIdx.set(a, i);
  }
  // Build the forward edge list: predecessor → successor.
  // successor's `before` === predecessor's `after`.
  const next: Array<number | null> = Array(rowsWithBefore.length).fill(null);
  const hasPredecessor = Array(rowsWithBefore.length).fill(false);
  for (let i = 0; i < rowsWithBefore.length; i++) {
    const predIdx = afterToIdx.get(rowsWithBefore[i].before);
    if (predIdx !== undefined) {
      next[predIdx] = i;
      hasPredecessor[i] = true;
    }
  }
  // Start node = the one row with no predecessor in the group.
  const starts = hasPredecessor
    .map((flag, i) => (flag ? -1 : i))
    .filter((i) => i >= 0);
  if (starts.length !== 1) return group; // ambiguous (cycle or multiple roots)
  const sorted: T[] = [];
  let cursor: number | null = starts[0];
  const visited = new Set<number>();
  while (cursor !== null) {
    if (visited.has(cursor)) return group; // cycle guard
    visited.add(cursor);
    sorted.push(rowsWithBefore[cursor].row);
    cursor = next[cursor];
  }
  if (sorted.length !== group.length) return group;
  return sorted;
}

/**
 * Full ascending chronological sort. Primary key: (date, time). For
 * rows that tie on both, fall back to the balance-chain heuristic.
 *
 * Returns a new array; does not mutate the input.
 */
export function sortChronologicalAsc<T extends ChronoRow>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const at = a.time ?? "";
    const bt = b.time ?? "";
    if (at !== bt) return at < bt ? -1 : 1;
    return 0;
  });
  // Walk the sorted list, collect runs of identical (date, time),
  // and fix their ordering via the balance chain.
  const out: T[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (
      j < sorted.length &&
      sorted[j].date === sorted[i].date &&
      (sorted[j].time ?? "") === (sorted[i].time ?? "")
    ) {
      j++;
    }
    const group = sorted.slice(i, j);
    out.push(...sortTiedGroup(group));
    i = j;
  }
  return out;
}

/**
 * Descending chronological sort (newest first) — what the lifetime
 * table + parser output both want. Same balance-chain tiebreaker.
 */
export function sortChronologicalDesc<T extends ChronoRow>(rows: T[]): T[] {
  return sortChronologicalAsc(rows).reverse();
}
