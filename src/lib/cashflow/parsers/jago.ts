/**
 * Bank Jago rekening koran parser — CSV variant.
 *
 * Menggantikan parser PDF berbasis Gemini. Jago app punya fitur export
 * statement ke CSV dengan layout kolom tetap:
 *
 *   Date & Time | Source/Destination | Transaction Details | Notes | Amount | Balance
 *
 * Contoh baris:
 *   "30 Mar 2026 18:18","YULFARIDA ARINI BRI ...","Incoming Transfer ...","","+50.000,00","414.557,00"
 *
 * Parse deterministik — tanpa AI, tanpa biaya API, tanpa retry loop.
 * Quirks yang ditangani:
 *
 *   - Amount signed dengan `+` / `-` prefix (`+50.000,00`, `-136.000`).
 *   - Number format kadang inkonsisten: `467.057.00` maksudnya
 *     `467.057,00` (decimal . di-ketik bukan ,). Normalisasi multi-dot
 *     trailing-2-digit sebagai desimal.
 *   - Time pada `Date & Time` kadang `18:18`, kadang `20.02`, kadang
 *     `12-22` — semua disamakan ke `HH:MM`.
 *   - Nominal di-round ke rupiah integer (Jago Indonesia pakai IDR
 *     tanpa sub-unit di realita; `,00` trailing decimal = nol).
 */

import type { ParsedStatement, ParsedTransaction } from "../types";
import { inferPeriodFromDates, parseIndoAmount, parseIndoDate } from "./shared";

// CSV Jago selalu teks mentah. SheetJS sempat dipakai di awal tapi
// salah karena dia auto-coerce "+50.000,00" ke number 50 (mem-baca
// `.000` sebagai decimal), jadi parsing dilakukan manual pakai
// tokenizer RFC-4180 sederhana di bawah. String-only output → tidak
// ada data-loss karena coercion.
type Row = string[];

const HEADERS = [
  "date & time",
  "source/destination",
  "transaction details",
  "notes",
  "amount",
  "balance",
] as const;

export async function parseJagoStatement(
  buffer: Uint8Array,
  // Password disimpan di signature agar cocok dispatcher — tapi CSV
  // Jago tidak pernah di-encrypt, jadi parameter ini di-ignore.
  _password?: string
): Promise<ParsedStatement> {
  const warnings: string[] = [];

  const text = decodeCsvBuffer(buffer);
  const rows = parseCsv(text).filter((r) => r.some((c) => c.length > 0));
  if (rows.length === 0) {
    return emptyStatement(["File kosong / tidak ada baris data."]);
  }

  const detected = detectHeader(rows);
  if (!detected) {
    return emptyStatement([
      "Header tabel tidak terdeteksi. Pastikan file CSV punya kolom: Date & Time, Source/Destination, Transaction Details, Notes, Amount, Balance.",
    ]);
  }
  const { headerIdx, cols } = detected;

  const transactions: ParsedTransaction[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const dateTimeRaw = cellStr(row[cols.dateTime]);
    if (!dateTimeRaw) continue;
    const { date: isoDate, time } = parseDateTime(dateTimeRaw);
    if (!isoDate) continue;

    const amountCell = row[cols.amount];
    const { sign, value } = parseSignedAmount(amountCell);
    if (value === 0) continue;
    const debit = sign === "-" ? value : 0;
    const credit = sign === "-" ? 0 : value;

    const sourceDestination =
      cols.source !== -1 ? cellStr(row[cols.source]) : "";
    const transactionDetails =
      cols.details !== -1 ? stripIdHash(cellStr(row[cols.details])) : "";
    const notes = cols.notes !== -1 ? cellStr(row[cols.notes]) : "";
    const balance = parseUnsignedAmount(row[cols.balance]);

    const descFields = [sourceDestination, transactionDetails, notes].filter(
      Boolean
    );
    const description = descFields.join(" · ") || "Transaksi";

    transactions.push({
      date: isoDate,
      time,
      sourceDestination: sourceDestination || undefined,
      transactionDetails: transactionDetails || undefined,
      notes: notes || undefined,
      description,
      debit,
      credit,
      // Balance 0 adalah nilai valid (pocket bisa di-drain sampai 0
      // rupiah). Set undefined hanya kalau cell balance benar-benar
      // kosong (parseUnsignedAmount return null dalam kasus itu).
      runningBalance: balance ?? undefined,
    });
  }

  if (transactions.length === 0) {
    warnings.push(
      "Tidak ada transaksi yang ter-parse dari file. Pastikan formatnya sesuai export Jago (Date & Time, Source/Destination, Transaction Details, Notes, Amount, Balance)."
    );
  }

  const period = inferPeriodFromDates(transactions);
  return {
    periodMonth: period.periodMonth,
    periodYear: period.periodYear,
    // Opening/closing diturunkan di route dari first/last runningBalance.
    openingBalance: 0,
    closingBalance: 0,
    transactions,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────

interface HeaderMap {
  dateTime: number;
  source: number;
  details: number;
  notes: number;
  amount: number;
  balance: number;
}

function detectHeader(
  rows: Row[]
): { headerIdx: number; cols: HeaderMap } | null {
  const maxScan = Math.min(rows.length, 20);
  for (let i = 0; i < maxScan; i++) {
    const labels = rows[i].map((c) => c.trim().toLowerCase());
    const positions: Record<string, number> = {};
    for (const h of HEADERS) {
      const idx = labels.findIndex((l) => l === h);
      if (idx !== -1) positions[h] = idx;
    }
    if (
      positions["date & time"] !== undefined &&
      positions["amount"] !== undefined &&
      positions["balance"] !== undefined
    ) {
      return {
        headerIdx: i,
        cols: {
          dateTime: positions["date & time"],
          source: positions["source/destination"] ?? -1,
          details: positions["transaction details"] ?? -1,
          notes: positions["notes"] ?? -1,
          amount: positions["amount"],
          balance: positions["balance"],
        },
      };
    }
  }
  return null;
}

/**
 * Pecah `Date & Time` cell ke ISO date + HH:MM time. Jago format:
 * `"30 Mar 2026 18:18"` — tanggal Indonesian + jam (kadang separator
 * `.` atau `-` instead of `:` karena OCR / export quirk).
 */
function parseDateTime(raw: string): { date: string | null; time?: string } {
  const trimmed = raw.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 3) {
    const isoOnly = parseIndoDate(trimmed);
    return { date: isoOnly };
  }
  const dateStr = tokens.slice(0, 3).join(" ");
  const timeStr = tokens.slice(3).join(" ");
  const isoDate = parseIndoDate(dateStr);
  if (!isoDate) return { date: null };

  // Normalisasi jam: terima `HH:MM`, `HH.MM`, `HH-MM`.
  const tm = /^(\d{1,2})[:.\-](\d{2})/.exec(timeStr);
  const time = tm ? `${tm[1].padStart(2, "0")}:${tm[2]}` : undefined;
  return { date: isoDate, time };
}

/**
 * Parse Amount cell yang bisa ter-kontaminasi leakage dari kolom
 * notes: export Jago kadang bikin sel jadi `"1        -1.500.000"`
 * atau `"t         -1.964.967"` karena notes-nya ketipu truncation.
 * Ambil token angka bertanda TERAKHIR di string — itu yang value
 * asli. Kalau tidak ada tanda, fallback ke token numeric terakhir
 * (whitespace-terpisah).
 */
function parseSignedAmount(raw: string): { sign: "+" | "-"; value: number } {
  const trimmed = raw.trim();
  if (!trimmed) return { sign: "+", value: 0 };
  // Prioritas: token yang punya +/− eksplisit (signed). "g" flag + walk
  // supaya dapat match terakhir kalau ada leakage sebelum nominal asli.
  const signedRe = /([+\-])\s*(\d[\d.,]*)/g;
  let lastSigned: RegExpExecArray | null = null;
  let m;
  while ((m = signedRe.exec(trimmed)) !== null) lastSigned = m;
  if (lastSigned) {
    const sign = lastSigned[1] === "-" ? ("-" as const) : ("+" as const);
    const body = lastSigned[2];
    const n = parseIndoAmount(normalizeJagoNumber(body));
    return { sign, value: Math.max(0, Math.round(Math.abs(n))) };
  }
  // Tidak ada sign — ambil token whitespace-terpisah terakhir.
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1] ?? "";
  const n = parseIndoAmount(normalizeJagoNumber(last));
  return {
    sign: n < 0 ? "-" : "+",
    value: Math.max(0, Math.round(Math.abs(n))),
  };
}

/**
 * Parse Balance cell — selalu unsigned. Sama treatment dengan Amount
 * untuk leakage: kalau sel berisi `"1         5.390.687"`, ambil
 * token whitespace-terpisah terakhir (`"5.390.687"`), bukan digabung
 * jadi `15.390.687`.
 */
function parseUnsignedAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Split by whitespace, ambil token terakhir yang mengandung digit.
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    if (!/\d/.test(tok)) continue;
    const n = parseIndoAmount(normalizeJagoNumber(tok));
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

/**
 * Pre-process inconsistent thousand/decimal separators dari export
 * Jago sebelum diserahkan ke `parseIndoAmount`.
 *
 *   "467.057.00"  → "467.057,00"   // multi-dot, trailing-2 = decimal
 *   "85,000,00"   → "85.000,00"    // multi-comma, trailing-2 = decimal
 *   lainnya       → apa adanya
 */
function normalizeJagoNumber(s: string): string {
  const dotCount = (s.match(/\./g) ?? []).length;
  const commaCount = (s.match(/,/g) ?? []).length;
  if (dotCount >= 2 && commaCount === 0) {
    const lastDot = s.lastIndexOf(".");
    const afterLast = s.length - lastDot - 1;
    if (afterLast === 2) {
      return s.slice(0, lastDot) + "," + s.slice(lastDot + 1);
    }
  }
  if (commaCount >= 2 && dotCount === 0) {
    const lastComma = s.lastIndexOf(",");
    const afterLast = s.length - lastComma - 1;
    if (afterLast === 2) {
      const intPart = s.slice(0, lastComma).replace(/,/g, ".");
      return `${intPart},${s.slice(lastComma + 1)}`;
    }
  }
  return s;
}

function cellStr(cell: string | undefined): string {
  if (!cell) return "";
  return cell.replace(/\s+/g, " ").trim();
}

/**
 * Decode buffer ke string. Default UTF-8; kalau ada BOM UTF-8,
 * di-strip. Jago export biasanya UTF-8 tanpa BOM tapi tetap
 * defensive.
 */
function decodeCsvBuffer(buffer: Uint8Array): string {
  const decoder = new TextDecoder("utf-8");
  let s = decoder.decode(buffer);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

/**
 * Minimal CSV tokenizer (RFC 4180-ish). Handle quoted fields dengan
 * comma/newline di dalamnya, plus escaped `""` untuk literal quote.
 * Tidak support custom separator — Jago export selalu comma.
 */
function parseCsv(text: string): Row[] {
  const rows: Row[] = [];
  let field = "";
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;
  const len = text.length;
  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      // Biarkan \n handler yang tutup row; CRLF diserap di sini.
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Tutup row terakhir kalau file tidak berakhir dengan newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function stripIdHash(s: string): string {
  // "Incoming Transfer ID# 260330-Z6DU-MNFREZ" → "Incoming Transfer"
  return s.replace(/\s*ID#\s*\S+/gi, "").trim();
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
