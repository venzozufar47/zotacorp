/**
 * Live import from a Google Sheet (CSV export endpoint).
 *
 * We rely on Google's `gviz/tq?tqx=out:csv&sheet=<name>` endpoint,
 * which serves any shared-via-link sheet as CSV without OAuth. That
 * keeps the integration config-less: the admin pastes the sheet's
 * regular edit URL + tab name, sheet remains "anyone with link can
 * view", and server fetches CSV per sync.
 *
 * The sample layout (Haengbocake Cash Semarang):
 *   col A  — blank marker
 *   col B  — No.
 *   col C  — Tanggal ("01 October 2023")
 *   col D  — Uang Masuk ("Rp50,000")
 *   col E  — Keterangan (for credits)
 *   col F  — Uang Keluar ("Rp14,000")
 *   col G  — Keterangan (for debits)
 *   col H  — Saldo ("Rp266,100")
 *   col I  — KATEGORI (as-is — preserved even if not in preset)
 */

import type { ParsedTransaction } from "./types";
import { parseIndoAmount } from "./parsers/shared";

export interface SheetImportResult {
  transactions: ParsedTransaction[];
  warnings: string[];
}

/**
 * Convert a browser URL like
 *   https://docs.google.com/spreadsheets/d/<ID>/edit?...
 * plus a tab name into the CSV export endpoint.
 */
export function buildSheetCsvUrl(sourceUrl: string, sheetName: string): string {
  const match = sourceUrl.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!match) {
    throw new Error(
      "URL Google Sheet tidak valid — harus mengandung /spreadsheets/d/<id>/"
    );
  }
  const id = match[1];
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName
  )}`;
}

/**
 * Parse Indonesian date strings like "01 October 2023" or "3 March
 * 2026" into YYYY-MM-DD. Accepts English month names (the sheet uses
 * those even in an otherwise Indonesian UI). Returns null if unparseable.
 */
function parseSheetDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const months: Record<string, number> = {
    january: 1, jan: 1, januari: 1,
    february: 2, feb: 2, februari: 2,
    march: 3, mar: 3, maret: 3,
    april: 4, apr: 4,
    may: 5, mei: 5,
    june: 6, jun: 6, juni: 6,
    july: 7, jul: 7, juli: 7,
    august: 8, aug: 8, agu: 8, agt: 8, agustus: 8,
    september: 9, sep: 9, sept: 9,
    october: 10, oct: 10, okt: 10, oktober: 10,
    november: 11, nov: 11,
    december: 12, dec: 12, des: 12, desember: 12,
  };
  const m = /^(\d{1,2})\s+(\p{L}+)\s+(\d{4})$/u.exec(s);
  if (!m) return null;
  const day = Number(m[1]);
  const monthIdx = months[m[2].toLowerCase()];
  if (!monthIdx) return null;
  const year = Number(m[3]);
  return `${year}-${String(monthIdx).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
}

/**
 * Parse the raw CSV text into ParsedTransactions. Doesn't write
 * anywhere — caller decides what to do with the result (dedupe against
 * DB + commit, usually).
 *
 * `defaultBranch` is the branch all rows inherit (sheet has no branch
 * column). `defaultCredit/DebitKeyword` are fallback descriptions when
 * both kolom keterangan are empty.
 */
export function parseSheetCsv(
  csvText: string,
  opts: {
    defaultBranch?: string | null;
  }
): SheetImportResult {
  const rows = parseCsvRows(csvText);
  const warnings: string[] = [];
  const transactions: ParsedTransaction[] = [];

  // Locate the header row: it's the row where column C text equals
  // "Tanggal" (Indonesian) or "Date". First row usually.
  let dataStart = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const headerCell = (rows[i][2] ?? "").toLowerCase();
    if (headerCell === "tanggal" || headerCell === "date") {
      dataStart = i + 1;
      break;
    }
  }

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    const dateRaw = row[2];
    const isoDate = parseSheetDate(dateRaw);
    if (!isoDate) continue; // skip blank / footer / separator rows

    const creditRaw = row[3];
    const creditNote = (row[4] ?? "").trim();
    const debitRaw = row[5];
    const debitNote = (row[6] ?? "").trim();
    const balanceRaw = row[7];
    const category = (row[8] ?? "").trim();

    const credit = creditRaw ? Math.max(0, Math.round(parseIndoAmount(creditRaw))) : 0;
    const debit = debitRaw ? Math.max(0, Math.round(parseIndoAmount(debitRaw))) : 0;

    // Skip rows with no amount — the sheet has these as opening/balance
    // seeds (e.g. "01 Oct 2023  Rp0  Rp0  Rp87,000"). Including them
    // would create zero-amount noise rows.
    if (credit === 0 && debit === 0) continue;

    const runningBalance = balanceRaw
      ? Math.round(parseIndoAmount(balanceRaw))
      : undefined;

    // Description = the keterangan that matches the side. Notes are
    // empty on this sheet (keterangan is all we have).
    const sideNote = credit > 0 ? creditNote : debitNote;
    const description =
      sideNote || (credit > 0 ? "Uang masuk" : "Uang keluar");

    // Cash sheet keterangan is a free-text memo — belongs in `notes`.
    // `transactionDetails` and `sourceDestination` stay empty for
    // cash rekening; the detail-table UI hides those columns entirely
    // for this bank type.
    transactions.push({
      date: isoDate,
      sourceDestination: undefined,
      transactionDetails: undefined,
      notes: sideNote || undefined,
      description,
      debit,
      credit,
      runningBalance:
        runningBalance !== undefined && Number.isFinite(runningBalance)
          ? runningBalance
          : undefined,
      category: category || null,
      branch: opts.defaultBranch ?? null,
    });
  }

  if (transactions.length === 0) {
    warnings.push(
      "Tidak ada baris transaksi yang ter-parse. Cek apakah tab + kolom sheet sesuai layout (Tanggal · Uang Masuk · Uang Keluar · Saldo · Kategori)."
    );
  }

  return { transactions, warnings };
}

/**
 * Minimal RFC-4180-ish CSV parser. Handles double-quoted cells with
 * embedded commas + doubled-quote escapes. Sufficient for Google's
 * gviz CSV output; skips BOM if present.
 */
function parseCsvRows(text: string): string[][] {
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && t[i + 1] === "\n") i++;
        row.push(cell);
        cell = "";
        rows.push(row);
        row = [];
      } else {
        cell += c;
      }
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c && c.trim() !== ""));
}

/** Convenience: one-shot fetch + parse. */
export async function fetchAndParseSheet(
  sourceUrl: string,
  sheetName: string,
  defaultBranch: string | null
): Promise<SheetImportResult> {
  const csvUrl = buildSheetCsvUrl(sourceUrl, sheetName);
  const res = await fetch(csvUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Gagal fetch sheet (HTTP ${res.status}). Pastikan sheet ter-share "anyone with link can view" dan nama tab-nya benar.`
    );
  }
  const csv = await res.text();
  return parseSheetCsv(csv, { defaultBranch });
}
