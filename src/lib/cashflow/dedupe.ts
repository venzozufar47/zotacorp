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
