/**
 * Shared types for the cashflow feature: the normalized shape every
 * bank-specific parser must emit, plus the persisted DB row aliases the
 * UI layer uses.
 */

export type BankCode =
  | "mandiri"
  | "jago"
  | "bca"
  | "bri"
  | "bni"
  | "cash"
  | "other";

export interface ParsedTransaction {
  /** `YYYY-MM-DD` in local time. */
  date: string;
  /** Optional `HH:mm` (some banks ship per-transaction timestamps). */
  time?: string;
  /** Source/Destination column from the PDF (counterparty + their bank info). */
  sourceDestination?: string;
  /** Transaction Details column (type + reference ID). */
  transactionDetails?: string;
  /** Notes column from the PDF (free-text memo the admin/transactor typed). */
  notes?: string;
  /** Legacy / fallback flattened text of the row, kept for backward compat
   *  with rows ingested before the structured columns existed. */
  description: string;
  /** Money out of the account. Always positive; use 0 for credit-only rows. */
  debit: number;
  /** Money into the account. Always positive; use 0 for debit-only rows. */
  credit: number;
  /** Saldo after this transaction, when printed on the statement. Optional. */
  runningBalance?: number;
  /** Auto-assigned category (from rules or historical match). Null = no match. */
  category?: string | null;
  /** Auto-assigned branch (from rules). Null = no match. */
  branch?: string | null;
}

export interface ParsedStatement {
  /** 1–12, inferred from the statement header or first transaction date. */
  periodMonth: number;
  periodYear: number;
  openingBalance: number;
  closingBalance: number;
  transactions: ParsedTransaction[];
  /** Any warnings the parser wants to surface to the admin during review. */
  warnings: string[];
}
