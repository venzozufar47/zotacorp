/**
 * Bank Jago rekening koran parser.
 *
 * Two-layer strategy:
 *   1. Primary: Gemini 2.5 Flash vision (`parseJagoViaGemini`). Reads the
 *      PDF table natively, returns structured JSON validated by zod +
 *      end-to-end balance check.
 *   2. Fallback: label-based deterministic parser (below). Kicks in when
 *      Gemini is unconfigured / errors / fails balance verification.
 *
 * The deterministic parser is intentionally simple: walk the flattened
 * row-grouped text, find date lines, and for each date-starting block
 * locate the transaction TYPE LABEL from a whitelist. Text before the
 * label = counterparty/source; label itself = transactionDetails; text
 * after the label (minus the amount + balance) = notes. This matches
 * how Jago visually lays each row and is resilient to column-width
 * drift (unlike X/Y clustering, which was brittle to header fragment
 * splits like "Date & Time" → 3 clusters).
 */

import type { ParsedStatement, ParsedTransaction } from "../types";
import { extractPdfPlainText } from "../pdf-extract";
import type { ParseOptions } from "../parse";
import { inferPeriodFromDates, parseIndoAmount, parseIndoDate } from "./shared";
import { parseJagoViaGemini } from "./jago-gemini";

/**
 * Public entry. Try Gemini vision first; fall back to the label-based
 * deterministic parser below. Fallback appends a visible warning so
 * the admin knows which path produced the rows.
 */
export async function parseJagoStatement(
  buffer: Uint8Array,
  options: ParseOptions = {}
): Promise<ParsedStatement> {
  const { password, referenceExamples } = options;
  try {
    return await parseJagoViaGemini(buffer, password, referenceExamples);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Fallback is reserved for onboarding cases where Gemini isn't
    // available at all — missing API key or PDF encryption the SDK
    // refuses to handle. Actual runtime failures (balance mismatch,
    // malformed JSON, quota) must surface so the admin can retry
    // instead of silently getting noisy data from the inferior
    // label-based parser.
    const softFallback =
      reason === "gemini not configured" ||
      reason.startsWith("encrypted PDF not supported by gemini");
    if (!softFallback) {
      throw err;
    }
    const fallback = await parseJagoDeterministic(buffer, password);
    return {
      ...fallback,
      warnings: [
        `gemini unavailable (${reason}); menggunakan parser deterministik`,
        ...fallback.warnings,
      ],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Deterministic label-based parser
// ─────────────────────────────────────────────────────────────────────

/**
 * Whitelist of Jago transaction type labels, ordered LONGEST FIRST so
 * "Outgoing Transfer Fee" is matched before the prefix "Outgoing
 * Transfer". Add to this list whenever the parser warns about an
 * unknown block — the user will feed new labels as they appear.
 */
const TRANSACTION_LABELS = [
  // 4-word
  "Outgoing Transfer Fee",
  "Incoming Transfer Fee",
  "Digital Product Payment Fee",
  // 3-word
  "Payment with Jago Pay",
  "Main Pocket Movement",
  "Digital Product Payment",
  "Jago Loan Installment",
  // 2-word
  "Outgoing Transfer",
  "Incoming Transfer",
  "Bill Payment",
  "ATM Withdrawal",
];

const DATE_RE = /\b\d{1,2}\s+\p{L}{3,}\s+\d{4}\b/u;
const TIME_RE = /\b\d{1,2}:\d{2}\b/;
// Signed amount: "+ 1.234.567,89" / "- 1.234,56". Numbers must have a
// separator so we don't match account numbers (13-digit plain).
const SIGNED_AMOUNT_RE =
  /([+\-])\s*((?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?)|(?:\d+[.,]\d{1,2}))/g;
// Plain amount (no sign) — same separator requirement.
const PLAIN_AMOUNT_RE =
  /((?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?)|(?:\d+[.,]\d{1,2}))/g;
const ID_HASH_RE = /\bID#\s*\S*/gi;

async function parseJagoDeterministic(
  buffer: Uint8Array,
  password?: string
): Promise<ParsedStatement> {
  const raw = await extractPdfPlainText(buffer, password);
  const warnings: string[] = [];

  if (!raw.trim()) {
    return emptyStatement([
      "PDF tidak menghasilkan teks apapun — kemungkinan scan tanpa OCR.",
    ]);
  }

  const lines = raw
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Every transaction block starts at a line containing an Indonesian
  // date ("03 Apr 2026"). We collect those indices then walk k → k+1
  // so each block is self-contained.
  const dateLineIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (DATE_RE.test(lines[i])) dateLineIdx.push(i);
  }

  const transactions: ParsedTransaction[] = [];
  const unknownLabelSnippets: string[] = [];

  for (let k = 0; k < dateLineIdx.length; k++) {
    const startIdx = dateLineIdx[k];
    // End of block: the next date line, or (for the last block) at most
    // 4 lines out — prevents the last tx from swallowing the PDF footer.
    const endIdx =
      dateLineIdx[k + 1] ?? Math.min(startIdx + 4, lines.length);
    const blockLines = lines.slice(startIdx, endIdx);
    const blockText = blockLines.join(" ");

    const tx = assembleTransactionFromBlock(blockText, unknownLabelSnippets);
    if (tx) transactions.push(tx);
  }

  if (transactions.length === 0) {
    warnings.push(
      "Tidak ada baris transaksi yang ter-parse. Cek apakah format PDF sesuai template Jago (tanggal + label + amount bertanda + saldo)."
    );
  }

  // Surface unknown labels so the user can feed them back for the
  // whitelist — up to 3 inline, then a count.
  if (unknownLabelSnippets.length > 0) {
    const sample = unknownLabelSnippets.slice(0, 3);
    warnings.push(
      `${unknownLabelSnippets.length} baris tidak cocok dengan label transaksi yang dikenal. Contoh: ${sample
        .map((s) => `"${s}"`)
        .join(", ")}. Tambahkan ke TRANSACTION_LABELS di parser.`
    );
  }

  const period = inferPeriodFromDates(transactions);
  return {
    periodMonth: period.periodMonth,
    periodYear: period.periodYear,
    // Opening/closing are derived from first/last runningBalance in
    // the preview route; leaving 0 here is intentional.
    openingBalance: 0,
    closingBalance: 0,
    transactions,
    warnings,
  };
}

/**
 * Turn a single transaction's block text into a ParsedTransaction.
 * Returns null (and pushes to `unknownLabels` when the block looks
 * like a real transaction but we couldn't match a label).
 */
function assembleTransactionFromBlock(
  blockText: string,
  unknownLabels: string[]
): ParsedTransaction | null {
  // Strip ID# tokens entirely — product rule.
  const cleaned = blockText.replace(ID_HASH_RE, " ").replace(/\s+/g, " ").trim();

  const dateMatch = DATE_RE.exec(cleaned);
  if (!dateMatch) return null;
  const isoDate = parseIndoDate(dateMatch[0]);
  if (!isoDate) return null;

  const timeMatch = TIME_RE.exec(cleaned);
  const time = timeMatch ? timeMatch[0] : undefined;

  // Amount must be signed — without +/− we cannot tell debit from
  // credit, and silent mis-classification is worse than a skipped row.
  const signedMatches = [...cleaned.matchAll(SIGNED_AMOUNT_RE)];
  if (signedMatches.length === 0) return null;
  // Last signed number in the block is the transaction amount (balance
  // column is unsigned — sits to its right).
  const lastSigned = signedMatches[signedMatches.length - 1];
  const isNegative = lastSigned[1] === "-";
  const amtNum = Math.abs(parseIndoAmount(lastSigned[2]));

  // Balance = the LAST plain (unsigned) amount in the block, AFTER the
  // signed amount's position. Anything before is part of the body.
  const afterAmount = cleaned.slice(lastSigned.index! + lastSigned[0].length);
  const plainMatches = [...afterAmount.matchAll(PLAIN_AMOUNT_RE)];
  const balance =
    plainMatches.length > 0
      ? parseIndoAmount(plainMatches[plainMatches.length - 1][1])
      : null;

  // Find the transaction label (LAST match — handles cases where the
  // label word appears inside a preceding source/memo field).
  let labelPos = -1;
  let labelLen = 0;
  let matchedLabel: string | null = null;
  for (const label of TRANSACTION_LABELS) {
    const re = new RegExp(`\\b${escapeRegex(label)}\\b`, "gi");
    const all = [...cleaned.matchAll(re)];
    if (all.length === 0) continue;
    const last = all[all.length - 1];
    if (last.index! >= labelPos) {
      labelPos = last.index!;
      labelLen = last[0].length;
      matchedLabel = label;
    }
  }

  // Block-text slicing for source / details / notes:
  //   [date]  [time?]  [source]  [LABEL]  [notes]  [±amount]  [balance]
  // If we can't find a label, still emit the row but flag it — this
  // way a label-mismatch doesn't drop data silently.
  const amountStart = lastSigned.index!;

  let sourceText: string;
  let notesText: string;
  let detailsText: string;

  if (matchedLabel && labelPos < amountStart) {
    sourceText = cleaned.slice(0, labelPos);
    notesText = cleaned.slice(labelPos + labelLen, amountStart);
    detailsText = matchedLabel;
  } else {
    // Fallback: no label found. Put everything-before-amount into
    // source, details empty, notes empty. The warning collector
    // upstream will ping the user.
    sourceText = cleaned.slice(0, amountStart);
    notesText = "";
    detailsText = "";
    // Only flag it if the block is actually substantial (avoid
    // flagging a header row or a footer fragment).
    if (sourceText.trim().length > 10) {
      unknownLabels.push(sourceText.slice(0, 80).trim());
    }
  }

  // Remove the date + time from the leading source field so it
  // doesn't double up in the display.
  sourceText = stripLeading(sourceText, [dateMatch[0], time ?? ""]);

  const sourceDestination = trimOrUndef(sourceText);
  const transactionDetails = trimOrUndef(detailsText);
  const notes = trimOrUndef(notesText);

  const description =
    [sourceDestination, transactionDetails, notes]
      .filter(Boolean)
      .join(" · ") || "Transaksi";

  return {
    date: isoDate,
    time,
    sourceDestination,
    transactionDetails,
    notes,
    description,
    debit: isNegative ? amtNum : 0,
    credit: isNegative ? 0 : amtNum,
    runningBalance: balance !== null && Number.isFinite(balance) ? balance : undefined,
  };
}

function stripLeading(s: string, needles: string[]): string {
  let out = s;
  for (const n of needles) {
    if (!n) continue;
    out = out.replace(n, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

function trimOrUndef(s: string): string | undefined {
  const t = s.replace(/\s+/g, " ").trim();
  return t || undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
