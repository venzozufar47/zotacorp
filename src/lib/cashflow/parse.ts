/**
 * Dispatcher that routes an uploaded PDF to the right bank-specific
 * parser. Any bank not yet supported falls through to a no-op parser
 * that returns an empty table with a warning — admin fills in rows
 * manually.
 */

import { parseJagoStatement } from "./parsers/jago";
import { parseMandiriXlsxStatement } from "./parsers/mandiri-xlsx";
import type { BankCode, ParsedStatement } from "./types";

/** Options passed through to individual parsers. */
export interface ParseOptions {
  password?: string;
}

export async function parseRekeningKoran(
  bank: BankCode,
  buffer: Uint8Array,
  options: ParseOptions = {}
): Promise<ParsedStatement> {
  switch (bank) {
    case "mandiri":
      return parseMandiriXlsxStatement(buffer, options.password);
    case "jago":
      return parseJagoStatement(buffer, options.password);
    default: {
      const now = new Date();
      return {
        periodMonth: now.getMonth() + 1,
        periodYear: now.getFullYear(),
        openingBalance: 0,
        closingBalance: 0,
        transactions: [],
        warnings: [
          `Parser untuk bank "${bank}" belum tersedia. Isi saldo awal/akhir + transaksi secara manual.`,
        ],
      };
    }
  }
}
