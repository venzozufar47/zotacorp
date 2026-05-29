/**
 * Bank BCA "Mutasi Rekening" PDF parser.
 *
 * Layout target (lihat sample MutasiBCA):
 *
 *   TANGGAL | KETERANGAN (multi-line) | MUTASI (nominal + flag DB/CR)
 *
 * Karakteristik khas BCA yang membedakan dari Mandiri/Jago:
 *   - **Tidak ada kolom Saldo per baris.** Mutasi rekening BCA hanya
 *     menampilkan nominal mutasi + flag DB/CR. Jadi `runningBalance`
 *     selalu undefined dan balance-chain reconciliation di-skip
 *     (opening/closing = 0 + warning).
 *   - **Tanggal di-truncate** jadi `DD/MM/...` (tahun dipotong di
 *     render). Tahun diambil dari header `PERIODE : DD/MM/YYYY - ...`.
 *   - **Keterangan 2 baris**: baris-1 punya tanggal + mutasi + flag,
 *     baris-2 (mis. "KR OTOMATIS", "BI-FAST DB") adalah lanjutan
 *     keterangan tanpa tanggal/mutasi.
 *   - **Debit vs kredit** ditentukan flag DB (keluar) / CR (masuk),
 *     bukan kolom terpisah.
 *
 * `extractPdfPlainText` sudah grouping per-Y jadi tiap baris visual
 * = 1 line teks; baris transaksi diakhiri "<mutasi> <CR|DB>".
 */

import type { ParsedStatement, ParsedTransaction } from "../types";
import { extractPdfPlainText } from "../pdf-extract";
import { inferPeriodFromDates, parseIndoAmount } from "./shared";

// Amount BCA: comma-thousands + 2 desimal ("165,000.00", "3,500,000.00")
// ATAU plain tanpa pemisah ribuan ("165000.00", "0.00" di detail QRIS).
const AMOUNT_RE = /\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/g;
// Baris transaksi diawali tanggal DD/MM (tahun bisa di-truncate "/..."
// atau "/YY"/"/YYYY"). Capture DD + MM.
const LEADING_DATE_RE = /^(\d{1,2})\/(\d{1,2})(?:\/\S*)?\s+/;
// Flag mutasi di akhir baris.
const FLAG_RE = /\b(CR|DB)\s*$/;

// Baris header/footer yang harus di-skip saat menyusun keterangan
// lanjutan, supaya noise tidak nyangkut ke deskripsi transaksi.
const NOISE_LINE_RE =
  /^(NO\.?\s*REKENING|NAMA|HALAMAN|JENIS\s*TRANSAKSI|PERIODE|MATA\s*UANG|TANGGAL|KETERANGAN|MUTASI|CATATAN|Apabila\s*nasabah|BCA\s*berhak|data\s*yang\s*tercantum|sampai\s*dengan|MUTASI\s*REKENING)/i;

export async function parseBcaStatement(
  buffer: Uint8Array,
  password?: string
): Promise<ParsedStatement> {
  const text = await extractPdfPlainText(buffer, password);
  const warnings: string[] = [];

  // Tahun + rentang dari header "PERIODE : 01/04/2026 - 07/04/2026".
  const periodMatch =
    /PERIODE\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(
      text
    );
  let headerYear: number | null = null;
  if (periodMatch) {
    headerYear = Number(periodMatch[3]);
  } else {
    warnings.push(
      "Header PERIODE tidak terbaca — tahun transaksi diasumsikan dari konteks. Cek tanggal saat review."
    );
  }
  const fallbackYear = headerYear ?? new Date().getFullYear();

  const transactions: ParsedTransaction[] = [];
  let lastTx: ParsedTransaction | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;

    const dateMatch = LEADING_DATE_RE.exec(line);
    const flagMatch = FLAG_RE.exec(line);

    if (dateMatch && flagMatch) {
      // --- Baris transaksi ---
      const dd = dateMatch[1].padStart(2, "0");
      const mm = dateMatch[2].padStart(2, "0");
      const date = `${fallbackYear}-${mm}-${dd}`;
      const flag = flagMatch[1].toUpperCase(); // CR | DB

      const beforeFlag = line.slice(0, flagMatch.index);
      const amts = [...beforeFlag.matchAll(AMOUNT_RE)].map((m) => m[0]);
      if (amts.length === 0) {
        // Ada flag tapi tidak ada nominal → kemungkinan baris aneh.
        // Lewati; akan ke-flag lewat count mismatch di akhir.
        continue;
      }
      // Mutasi = nominal terakhir sebelum flag (paling kanan).
      const mutasiRaw = amts[amts.length - 1];
      const mutasi = parseIndoAmount(mutasiRaw);

      // Keterangan = teks antara tanggal dan nominal mutasi (termasuk
      // detail QR/DDR yang menempel — berguna untuk auto-kategorisasi).
      const ketStart = dateMatch[0].length;
      const ketEnd = beforeFlag.lastIndexOf(mutasiRaw);
      const description = beforeFlag.slice(ketStart, ketEnd).trim();

      const tx: ParsedTransaction = {
        date,
        // Biarkan kosong dulu — beberapa baris (mis. "BIAYA ADM") punya
        // keterangan murni di baris-2, line-1-nya kosong. Diisi via
        // continuation di bawah, placeholder di-set di final pass.
        description,
        debit: flag === "DB" ? mutasi : 0,
        credit: flag === "CR" ? mutasi : 0,
        runningBalance: undefined, // BCA mutasi tidak menyertakan saldo
      };
      transactions.push(tx);
      lastTx = tx;
    } else if (lastTx && !dateMatch && !NOISE_LINE_RE.test(line)) {
      // --- Baris lanjutan keterangan (mis. "KR OTOMATIS", "BI-FAST DB",
      // "BIAYA ADM", "TRSF E-BANKING DB") ---
      // Tidak punya tanggal di awal; tempel ke transaksi terakhir.
      lastTx.description = `${lastTx.description} ${line}`.trim();
    }
  }

  // Final pass: transaksi yang deskripsinya tetap kosong → placeholder.
  for (const tx of transactions) {
    if (!tx.description.trim()) tx.description = "(tanpa keterangan)";
  }

  const period = inferPeriodFromDates(transactions);

  if (transactions.length === 0) {
    warnings.push(
      "Tidak ada baris transaksi terbaca dari PDF BCA. Pastikan ini file 'Mutasi Rekening' BCA (bukan e-Statement format lain), atau isi manual."
    );
  } else {
    warnings.push(
      `${transactions.length} transaksi terbaca. Catatan: mutasi BCA tidak menyertakan kolom saldo, jadi verifikasi saldo otomatis di-skip — pastikan opening/closing balance diisi manual saat review bila perlu.`
    );
  }

  return {
    periodMonth: period.periodMonth,
    periodYear: period.periodYear,
    openingBalance: 0,
    closingBalance: 0,
    transactions,
    warnings,
  };
}
