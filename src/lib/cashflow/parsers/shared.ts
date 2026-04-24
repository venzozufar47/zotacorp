/**
 * Parsing helpers shared across bank-specific rekening koran parsers.
 */

import { sortChronologicalAsc } from "../chronological";

/**
 * Parse an Indonesian-formatted amount like `"1.234.567,89"` or `"1,234,567.89"`
 * or plain `"1234567.89"` into a number. Returns 0 for empty/invalid input.
 */
export function parseIndoAmount(raw: string | null | undefined): number {
  if (!raw) return 0;
  let s = raw.trim();
  if (!s) return 0;
  // Drop currency prefix (Rp, IDR) and anything non-digit/sign/.,
  s = s.replace(/(?:Rp\.?|IDR)\s*/gi, "");
  const isNegative = s.startsWith("-") || s.endsWith("-");
  s = s.replace(/^-|-$/g, "");
  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return 0;

  // If both `.` and `,` present → assume Indonesian format (. thousands, , decimal).
  // If only one is present, use it as the decimal separator if it has exactly 2 digits after.
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    // One is thousand, one is decimal — whichever comes last is decimal.
    if (lastComma > lastDot) {
      // Indonesian: "1.234,56"
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // English: "1,234.56"
      normalized = s.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    // Only comma → Indonesian decimal if 1–2 digits after, else thousand.
    const after = s.length - lastComma - 1;
    normalized = after <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const after = s.length - lastDot - 1;
    normalized = after <= 2 ? s : s.replace(/\./g, "");
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return isNegative ? -n : n;
}

const MONTHS_ID: Record<string, number> = {
  jan: 1, januari: 1,
  feb: 2, februari: 2,
  mar: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  agu: 8, agt: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10,
  nov: 11, november: 11,
  des: 12, dec: 12, desember: 12, december: 12,
};

/**
 * Best-effort parser for Indonesian date strings commonly seen on
 * rekening koran: `DD/MM/YYYY`, `DD-MM-YYYY`, `DD MMM YYYY`,
 * `DD MMM YY`, `DD-MMM-YY`, `YYYY-MM-DD`. Returns ISO `YYYY-MM-DD` on
 * success, null otherwise.
 *
 * Bank-specific parsers may need to supply `defaultYear` when the
 * statement drops the year on each row.
 */
export function parseIndoDate(
  raw: string | null | undefined,
  defaultYear?: number
): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // ISO first
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  // Numeric DD/MM/YYYY or DD-MM-YYYY (4-digit year)
  const num4 = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (num4) {
    return `${num4[3]}-${num4[2].padStart(2, "0")}-${num4[1].padStart(2, "0")}`;
  }

  // Numeric DD/MM/YY (2-digit year → 20xx)
  const num2 = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/.exec(s);
  if (num2) {
    const yy = Number(num2[3]);
    const year = yy < 70 ? 2000 + yy : 1900 + yy;
    return `${year}-${num2[2].padStart(2, "0")}-${num2[1].padStart(2, "0")}`;
  }

  // Textual: "03 Apr 2026", "03 April 2026", "3-Apr-26"
  const text = /^(\d{1,2})[\s\-.](\p{L}{3,})[\s\-.](\d{2,4})$/u.exec(s);
  if (text) {
    const m = MONTHS_ID[text[2].toLowerCase()];
    if (!m) return null;
    let y = Number(text[3]);
    if (y < 100) y = y < 70 ? 2000 + y : 1900 + y;
    return `${y}-${String(m).padStart(2, "0")}-${text[1].padStart(2, "0")}`;
  }

  // Textual without year: "03 Apr" — need defaultYear
  const textNoYear = /^(\d{1,2})[\s\-.](\p{L}{3,})$/u.exec(s);
  if (textNoYear && defaultYear) {
    const m = MONTHS_ID[textNoYear[2].toLowerCase()];
    if (!m) return null;
    return `${defaultYear}-${String(m).padStart(2, "0")}-${textNoYear[1].padStart(2, "0")}`;
  }

  return null;
}

/**
 * End-to-end balance reconciliation. Takes the PDF-read opening +
 * closing balances plus the full transaction list (already filtered
 * to the admin's chosen date range) and asks: does the math add up?
 *
 *   computed = openingBalance + Σcredit − Σdebit
 *
 * If `computed === closingBalance` the PDF was read completely and
 * accurately — no missing rows, no duplicates, no wrong-column digits.
 * A mismatch, no matter how small, is a hard signal something is off.
 *
 * Tolerance of 1 rupiah covers rounding in the Indonesian-format
 * parse (numbers like "1.234,5" can round-trip to "1234.50" etc.).
 */
export function verifyBalance(
  openingBalance: number,
  closingBalance: number,
  transactions: Array<{ debit: number; credit: number }>
): {
  match: boolean;
  computed: number;
  diff: number;
  sumCredit: number;
  sumDebit: number;
} {
  const sumCredit = transactions.reduce((s, t) => s + (t.credit || 0), 0);
  const sumDebit = transactions.reduce((s, t) => s + (t.debit || 0), 0);
  const computed = openingBalance + sumCredit - sumDebit;
  const diff = Math.abs(computed - closingBalance);
  return {
    match: diff <= 1,
    computed,
    diff,
    sumCredit,
    sumDebit,
  };
}

/**
 * Walk chronologically through a list of parsed transactions and
 * verify the bank-statement invariant:
 *
 *    prev.runningBalance + cur.credit − cur.debit === cur.runningBalance
 *
 * Any row that breaks it is almost always a parse error (wrong amount
 * token, footer text bleeding into the row, page-break duplication).
 * Returns a list of human-readable warning strings — callers decide how
 * to surface them (we append to the ParsedStatement warnings).
 *
 * Called AFTER any date-range filtering so mismatches outside the
 * admin's window don't pollute the warning list.
 */
export function validateZeroSum(
  transactions: Array<{
    date: string;
    description: string;
    debit: number;
    credit: number;
    runningBalance?: number | null;
  }>
): string[] {
  if (transactions.length < 2) return [];
  const warnings: string[] = [];
  const formatRp = (n: number) => n.toLocaleString("id-ID");
  // Balance-chain-aware sort so same-minute rows stay in the correct
  // order (oldest-first within tied date+time). A pure date-asc sort
  // fails here because Gemini emits newest-first, leaving intra-day
  // clusters reversed — and every adjacency check against the prior
  // runningBalance would mispredict, producing dozens of false
  // "saldo tidak konsisten" warnings.
  const chronological = sortChronologicalAsc(transactions);
  let mismatchCount = 0;
  for (let i = 1; i < chronological.length; i++) {
    const prev = chronological[i - 1];
    const cur = chronological[i];
    if (
      typeof prev.runningBalance !== "number" ||
      typeof cur.runningBalance !== "number"
    ) {
      continue;
    }
    const expected = prev.runningBalance + cur.credit - cur.debit;
    const diff = Math.abs(expected - cur.runningBalance);
    if (diff > 1) {
      mismatchCount++;
      // Only name the first 3 offenders inline — beyond that it's
      // cheaper for the admin to just eyeball the table.
      if (mismatchCount <= 3) {
        warnings.push(
          `Saldo tidak konsisten di ${cur.date} "${cur.description.slice(
            0,
            60
          )}${cur.description.length > 60 ? "…" : ""}": seharusnya ${formatRp(
            Math.round(expected)
          )}, ter-parse ${formatRp(
            cur.runningBalance
          )}. Kemungkinan angka yang dibaca salah.`
        );
      }
    }
  }
  if (mismatchCount > 3) {
    warnings.push(
      `…dan ${mismatchCount - 3} baris lain dengan saldo tidak konsisten. Cek manual di tabel review.`
    );
  }
  return warnings;
}

/**
 * Infer the statement's (month, year) from the bulk of its transaction
 * dates. Picks the mode month; ties → earliest. Defaults to now if no
 * valid transactions.
 */
export function inferPeriodFromDates(
  transactions: Array<{ date: string }>
): { periodMonth: number; periodYear: number } {
  const counts = new Map<string, number>();
  for (const t of transactions) {
    const m = /^(\d{4})-(\d{2})/.exec(t.date);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bestKey: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && (bestKey === null || key < bestKey))) {
      bestKey = key;
      bestCount = count;
    }
  }
  if (bestKey) {
    const [y, m] = bestKey.split("-").map(Number);
    return { periodMonth: m, periodYear: y };
  }
  const now = new Date();
  return { periodMonth: now.getMonth() + 1, periodYear: now.getFullYear() };
}
