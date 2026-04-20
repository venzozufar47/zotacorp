/**
 * Bank Mandiri rekening koran parser.
 *
 * The Mandiri statement layout we target:
 *
 *   Posting Date | Effective Date | Journal | Uraian Transaksi | Debit | Kredit | Saldo
 *
 * Both "Tabungan" and "Giro" reports share the same column set; the
 * parser reads each row by detecting the leading date token and then
 * extracting two trailing amount columns (debit/kredit, one of which is
 * zero) plus the running balance.
 *
 * The parser is intentionally forgiving: opening/closing balance are
 * harvested from header/footer lines but ultimately verified by the
 * admin during review.
 */

import type { ParsedStatement, ParsedTransaction } from "../types";
import { extractPdfPlainText } from "../pdf-extract";
import {
  inferPeriodFromDates,
  parseIndoAmount,
  parseIndoDate,
} from "./shared";

const AMOUNT_RE = /-?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?/g;
const LEADING_DATE_RE = /^\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s+/;

export async function parseMandiriStatement(
  buffer: Uint8Array,
  password?: string
): Promise<ParsedStatement> {
  const text = await extractPdfPlainText(buffer, password);
  const warnings: string[] = [];

  // Opening balance: look for "Saldo Awal" anywhere in the first half of
  // the document. Closing balance: last "Saldo Akhir" / "Saldo Tersedia".
  const openingBalance = findLabeledAmount(text, [
    /saldo\s*awal[^0-9\-]*/i,
    /previous\s*balance[^0-9\-]*/i,
  ]);
  const closingBalance = findLabeledAmount(text, [
    /saldo\s*akhir[^0-9\-]*/i,
    /saldo\s*tersedia[^0-9\-]*/i,
    /ending\s*balance[^0-9\-]*/i,
  ]);
  if (openingBalance === null) warnings.push("Saldo awal tidak ditemukan di PDF — isi manual saat review.");
  if (closingBalance === null) warnings.push("Saldo akhir tidak ditemukan di PDF — isi manual saat review.");

  const transactions: ParsedTransaction[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.replace(/\s+/g, " ").trim();
    if (!trimmed) continue;
    const dateMatch = LEADING_DATE_RE.exec(trimmed);
    if (!dateMatch) continue;
    const date = parseIndoDate(dateMatch[1]);
    if (!date) continue;

    // Pull all amount tokens on the row. The Mandiri layout typically
    // ends with [debit|0] [credit|0] [saldo]; some exports print three
    // amounts. We assume the trailing three are the numeric columns.
    const rest = trimmed.slice(dateMatch[0].length);
    const amounts = [...rest.matchAll(AMOUNT_RE)].map((m) => m[0]);
    if (amounts.length < 2) continue;

    const [saldoRaw, ...preRaw] = amounts.slice(-3).reverse();
    const saldo = parseIndoAmount(saldoRaw);
    // preRaw has kredit first (reversed), then debit.
    const kredit = parseIndoAmount(preRaw[0] ?? "0");
    const debit = parseIndoAmount(preRaw[1] ?? "0");

    // Description = everything on the row before the last three amount
    // tokens. We find the position by locating the last amount match
    // start in the row.
    const lastThreeStarts = [...rest.matchAll(AMOUNT_RE)]
      .slice(-3)
      .map((m) => m.index ?? 0);
    const descEnd = Math.min(...lastThreeStarts);
    const description = rest.slice(0, descEnd).trim();
    if (!description) continue;

    transactions.push({
      date,
      description,
      debit: Number.isFinite(debit) ? debit : 0,
      credit: Number.isFinite(kredit) ? kredit : 0,
      runningBalance: Number.isFinite(saldo) ? saldo : undefined,
    });
  }

  const period = inferPeriodFromDates(transactions);

  if (transactions.length === 0) {
    warnings.push("Tidak ada baris transaksi terbaca — mungkin format PDF Mandiri yang berbeda. Silakan isi manual.");
  }

  return {
    periodMonth: period.periodMonth,
    periodYear: period.periodYear,
    openingBalance: openingBalance ?? 0,
    closingBalance: closingBalance ?? 0,
    transactions,
    warnings,
  };
}

/**
 * Find a labeled amount in the flattened plain text. Returns the amount
 * following the first matching label regex, or null if nothing matches.
 */
function findLabeledAmount(text: string, labels: RegExp[]): number | null {
  for (const re of labels) {
    const combined = new RegExp(re.source + String.raw`(-?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?)`, re.flags);
    const m = combined.exec(text);
    if (m) return parseIndoAmount(m[1]);
  }
  return null;
}
