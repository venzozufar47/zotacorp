/**
 * Display constants for bank presentation — label & brand color.
 * Centralized di sini biar tidak ada duplikat di antara halaman finance
 * admin + investor + UploadStatementDialog.
 */

import type { BankCode } from "./types";

export const BANK_LABELS: Record<BankCode, string> = {
  mandiri: "Bank Mandiri",
  jago: "Bank Jago",
  bca: "BCA",
  bri: "BRI",
  bni: "BNI",
  cash: "Cash",
  other: "Bank lainnya",
};

/** Brand color hex per bank — dipakai sebagai background kartu rekening
 *  picker saat di-select (white text di atasnya). */
export const BANK_COLORS: Record<BankCode, string> = {
  mandiri: "#003d79",
  bca: "#0a4a82",
  bri: "#003a70",
  bni: "#005d8f",
  jago: "#f7941d",
  cash: "#5b6873",
  other: "#475569",
};
