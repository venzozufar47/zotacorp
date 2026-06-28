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

/**
 * Peta confusable letter Yunani/Cyrillic → Latin. Sebelumnya data
 * Jago di-parse pakai Gemini yang kadang hallucinate glyph
 * bentuk-mirip (Β Ν Ι Α Ρ Τ — Greek uppercase mirip B N I A P T).
 * Agar row yang sudah-di-DB tetap dedupe terhadap re-upload CSV
 * native, kita fold semua lookalike ke bentuk Latin sebelum jadi key.
 */
const CONFUSABLES: Record<string, string> = {
  // Greek uppercase → Latin
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I",
  Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T",
  Υ: "Y", Χ: "X",
  // Cyrillic uppercase → Latin
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H",
  О: "O", Р: "P", С: "C", Т: "T", Х: "X",
};

function foldConfusables(s: string): string {
  let out = "";
  for (const ch of s) {
    out += CONFUSABLES[ch] ?? ch;
  }
  return out;
}

export function makeDedupeKey(t: DedupeKeyable): string {
  const date = t.transaction_date ?? t.date ?? "";
  const desc = foldConfusables(t.description).trim().toLowerCase();
  const rb = t.running_balance ?? t.runningBalance ?? "";
  return `${date}|${desc}|${t.debit}|${t.credit}|${rb}`;
}

export interface OccurrenceKeyOpts {
  /** Drop running_balance from the fingerprint (use for banks whose
   *  balance is synthetic, e.g. BCA CSV). */
  ignoreBalance?: boolean;
  /** Drop description from the fingerprint (use when descriptions are
   *  templated and/or manually annotated post-import, e.g. "[PENDING]"). */
  ignoreDescription?: boolean;
}

function dedupeBase(t: DedupeKeyable, opts: OccurrenceKeyOpts): string {
  const date = t.transaction_date ?? t.date ?? "";
  const desc = opts.ignoreDescription
    ? ""
    : foldConfusables(t.description).trim().toLowerCase();
  const rb = opts.ignoreBalance ? "" : t.running_balance ?? t.runningBalance ?? "";
  return `${date}|${desc}|${t.debit}|${t.credit}|${rb}`;
}

/**
 * Occurrence-aware dedupe keys for a list of rows. Within the list,
 * identical base fingerprints get a running occurrence index
 * (`base#0`, `base#1`, …). Matching two lists by these keys means a
 * fingerprint appearing N× in DB and M× in the upload yields min(N,M)
 * duplicates and the rest as new — so genuine same-day same-amount
 * repeats stay distinct while re-uploads dedupe 1:1.
 *
 * Built for balance-less rekening (BCA CSV): running_balance is
 * synthetic and descriptions may be manually annotated, so the classic
 * composite key is brittle. With ignoreBalance + ignoreDescription the
 * fingerprint reduces to date + debit + credit, made unique per row by
 * the occurrence index. Returns one key per input row, in order.
 */
export function makeOccurrenceKeys(
  rows: DedupeKeyable[],
  opts: OccurrenceKeyOpts = {}
): string[] {
  const counts = new Map<string, number>();
  return rows.map((t) => {
    const base = dedupeBase(t, opts);
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    return `${base}#${n}`;
  });
}
