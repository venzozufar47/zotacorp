/**
 * Canonical dedupe key for cashflow transactions.
 *
 * All three import paths (upload preview, upload commit, sheet sync,
 * manual entry) MUST use the same key so rows inserted via one path
 * dedupe correctly against rows from another. Composite fields are
 * stable fingerprints of the row: date, description, debit, credit,
 * and running balance.
 *
 * Accepts flexible shapes — both the parsed (camelCase) and DB row
 * (snake_case) variants — because callers feed in mixed data.
 */

export interface DedupeKeyable {
  transaction_date?: string | null;
  date?: string;
  description: string;
  debit: number;
  credit: number;
  running_balance?: number | null;
  runningBalance?: number | null;
}

export function makeDedupeKey(t: DedupeKeyable): string {
  const date = t.transaction_date ?? t.date ?? "";
  const desc = t.description.trim().toLowerCase();
  const rb = t.running_balance ?? t.runningBalance ?? "";
  return `${date}|${desc}|${t.debit}|${t.credit}|${rb}`;
}
