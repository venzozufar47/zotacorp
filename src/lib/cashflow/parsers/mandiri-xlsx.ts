/**
 * Bank Mandiri e-Statement (.xlsx) parser.
 *
 * Mandiri ships monthly e-Statements as password-protected Excel
 * spreadsheets with a very predictable layout — far cleaner to parse
 * than the PDF equivalent. Each transaction occupies TWO rows:
 *
 *   Row N:     [No, "", "", "", Tanggal, "", "", Keterangan,
 *               ..., Dana Masuk, "", "", Dana Keluar, "", "", Saldo]
 *   Row N+1:   ["", "", "", "", "HH:MM:SS WIB", "", "", "", ...]
 *
 * Keterangan is multi-line text; first line is the transaction type
 * ("Pencairan QR ke", "Transfer BI Fast", etc.) and the rest is
 * counterparty info + optional free-text memo on the last line.
 *
 * The .xlsx is password-protected with standard ECMA-376 encryption.
 * We decrypt via `officecrypto-tool`, parse with SheetJS, then walk
 * the grid looking for numeric rows in column A.
 */

import officeCrypto from "officecrypto-tool";
import * as XLSX from "xlsx";
import type { ParsedStatement, ParsedTransaction } from "../types";
import { PdfPasswordRequiredError } from "../pdf-extract";
import { parseIndoAmount, parseIndoDate } from "./shared";

// Fixed column offsets from the sample file layout. If Mandiri ever
// reshuffles columns we'll need to detect the header row instead.
const COL_NO = 0;
const COL_DATE = 4;
const COL_KETERANGAN = 7;
const COL_CREDIT = 15;
const COL_DEBIT = 18;
const COL_BALANCE = 21;

type Cell = string | number | null | undefined;
type Row = Cell[];

export async function parseMandiriXlsxStatement(
  buffer: Uint8Array,
  password?: string
): Promise<ParsedStatement> {
  const warnings: string[] = [];

  // The file is always encrypted in practice — Mandiri bundles a
  // password the customer sets at download time. Without it we
  // surface the same error the PDF path uses so the upload dialog
  // can prompt for the password.
  if (!password) throw new PdfPasswordRequiredError(false);

  let decrypted: Buffer;
  try {
    decrypted = await officeCrypto.decrypt(Buffer.from(buffer), {
      password,
    });
  } catch (err) {
    // Most decryption failures = wrong password. Surface as the
    // challenge-retry type.
    const msg = err instanceof Error ? err.message : String(err);
    if (/password/i.test(msg) || /hmac/i.test(msg)) {
      throw new PdfPasswordRequiredError(true);
    }
    throw err;
  }

  // xlsx emits harmless "Bad uncompressed size" warnings to stderr
  // when the underlying zip header is quirky (not unusual for files
  // post-decryption). Parsing still works; silence them for the
  // admin-facing logs.
  const origErr = console.error;
  console.error = () => undefined;
  let rows: Row[];
  try {
    const wb = XLSX.read(decrypted, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Row>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    });
  } finally {
    console.error = origErr;
  }

  if (rows.length === 0) {
    return emptyStatement(["File Excel kosong / sheet pertama tidak punya data."]);
  }

  // Extract opening / closing from the header block. Row indices are
  // stable across Mandiri's statement template but we search by label
  // so minor row-shifts don't break parsing.
  let openingBalance = 0;
  let closingBalance = 0;
  for (const row of rows.slice(0, 20)) {
    const joined = row.map((c) => String(c ?? "")).join(" ").toLowerCase();
    if (joined.includes("saldo awal") && openingBalance === 0) {
      openingBalance = findAmountInRow(row) ?? 0;
    }
    if (joined.includes("saldo akhir") && closingBalance === 0) {
      closingBalance = findAmountInRow(row) ?? 0;
    }
  }

  // Walk data rows. A transaction starts at any row whose column A is
  // a number (the No. column). The next row carries the time.
  const transactions: ParsedTransaction[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const no = row[COL_NO];
    if (typeof no !== "number") continue;

    const dateCell = row[COL_DATE];
    const isoDate = parseIndoDate(String(dateCell ?? "").trim());
    if (!isoDate) {
      warnings.push(
        `Row ${i + 1}: tanggal "${dateCell}" tidak bisa di-parse; baris di-skip.`
      );
      continue;
    }

    const timeCell = rows[i + 1]?.[COL_DATE];
    const timeMatch = /(\d{1,2}):(\d{2})(?::\d{2})?/.exec(String(timeCell ?? ""));
    const time = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : undefined;

    const keterangan = String(row[COL_KETERANGAN] ?? "").trim();
    const { transactionDetails, sourceDestination, notes, description } =
      splitKeterangan(keterangan);

    const credit = asAmount(row[COL_CREDIT]);
    const debit = asAmount(row[COL_DEBIT]);
    const balance = asAmount(row[COL_BALANCE]);

    // Skip rows that don't have a sensible amount (guards against
    // template edge cases — summary rows accidentally landing in the
    // numeric-No scan).
    if (credit === 0 && debit === 0) continue;

    transactions.push({
      date: isoDate,
      time,
      sourceDestination,
      transactionDetails,
      notes,
      description,
      debit,
      credit,
      runningBalance: balance !== 0 ? balance : undefined,
    });
  }

  if (transactions.length === 0) {
    warnings.push(
      "Tidak ada transaksi yang ter-parse. Cek apakah layout Excel-nya standar Mandiri (nomor di kolom A, tanggal di kolom E, dst)."
    );
  }

  // Infer period from the transaction dates rather than parsing the
  // header — more resilient to template wording changes.
  const period = inferPeriodFromTxs(transactions);

  return {
    periodMonth: period.month,
    periodYear: period.year,
    openingBalance,
    closingBalance,
    transactions,
    warnings,
  };
}

/**
 * Break a multi-line Mandiri keterangan into our four fields.
 *
 * Heuristic (based on sample formats):
 *   1 line:  transactionDetails = line, others empty
 *   2 lines: transactionDetails = line 1, sourceDestination = line 2
 *   3 lines: line 1 = details, lines 2+3 = counterparty
 *   4+ lines: line 1 = details, middle lines = counterparty,
 *             last line = notes IF it looks like free-text (no long
 *             numeric tokens — account numbers tend to fail that).
 */
function splitKeterangan(raw: string): {
  transactionDetails: string | undefined;
  sourceDestination: string | undefined;
  notes: string | undefined;
  description: string;
} {
  const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return {
      transactionDetails: undefined,
      sourceDestination: undefined,
      notes: undefined,
      description: "Transaksi",
    };
  }
  const description = lines.join(" · ");
  if (lines.length === 1) {
    return {
      transactionDetails: lines[0],
      sourceDestination: undefined,
      notes: undefined,
      description,
    };
  }
  const [details, ...rest] = lines;
  if (rest.length >= 3) {
    const last = rest[rest.length - 1];
    // "No long numeric id" heuristic — typical account/reference IDs
    // are ≥6 digits of unbroken numbers. Free-text notes rarely hit
    // that pattern.
    const looksLikeNotes = last.length > 0 && !/\b\d{6,}\b/.test(last);
    if (looksLikeNotes) {
      return {
        transactionDetails: details,
        sourceDestination: rest.slice(0, -1).join(" "),
        notes: last,
        description,
      };
    }
  }
  return {
    transactionDetails: details,
    sourceDestination: rest.join(" "),
    notes: undefined,
    description,
  };
}

function asAmount(cell: Cell): number {
  if (cell === null || cell === undefined || cell === "") return 0;
  if (typeof cell === "number") return cell;
  return parseIndoAmount(String(cell));
}

function findAmountInRow(row: Row): number | null {
  // Opening/closing balances live in the rightmost numeric cell on
  // their row. Scan right-to-left for a parseable amount.
  for (let i = row.length - 1; i >= 0; i--) {
    const c = row[i];
    if (c === null || c === undefined || c === "") continue;
    const n = typeof c === "number" ? c : parseIndoAmount(String(c));
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return null;
}

function inferPeriodFromTxs(txs: ParsedTransaction[]): {
  month: number;
  year: number;
} {
  if (txs.length === 0) {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }
  // Use the latest tx — admin-facing convention is "period = billing
  // month the statement covers", which is the newest month in the set.
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? 1 : -1));
  const [y, m] = sorted[0].date.split("-").map(Number);
  return { month: m, year: y };
}

function emptyStatement(warnings: string[]): ParsedStatement {
  const now = new Date();
  return {
    periodMonth: now.getMonth() + 1,
    periodYear: now.getFullYear(),
    openingBalance: 0,
    closingBalance: 0,
    transactions: [],
    warnings,
  };
}
