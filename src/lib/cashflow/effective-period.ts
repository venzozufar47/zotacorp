/**
 * Deteksi nama bulan di description transaksi → effective accounting
 * period (bulan akuntansi yang sebenarnya dimaksud oleh transaksi
 * tersebut, terpisah dari tanggal settlement-nya).
 *
 * Contoh: "Gaji Maret 2026" yang baru dibayar 3 April 2026 → tx
 * physically settles di April, tapi accounting period-nya Maret.
 * PnL aggregator akan menempatkan amount-nya di Maret 2026 (lihat
 * pnl.ts — kalau effective_period_month/year set, override
 * transaction_date untuk bucketing).
 *
 * Pure function, no IO. Caller (categorize pipeline / SQL backfill)
 * yang memutuskan kapan & ke kolom mana hasilnya dipersist.
 */

const MONTH_NAME_TO_NUM: Record<string, number> = {
  // Indonesian full
  januari: 1,
  februari: 2,
  maret: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  agustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  desember: 12,
  // Indonesian short
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  agu: 8,
  agus: 8,
  sep: 9,
  sept: 9,
  okt: 10,
  nov: 11,
  des: 12,
  // English short (sering muncul di keterangan)
  aug: 8,
  oct: 10,
  dec: 12,
};

const MONTH_REGEX =
  /\b(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agus?|aug|sept?|okt|oct|nov|des|dec)\b\s*(\d{2,4})?\b/i;

/**
 * Scan `description` untuk nama bulan + optional tahun. Return:
 *   - `{month, year}` saat ketemu (year diisi tx-year kalau tidak ada
 *     di description).
 *   - `null` saat tidak ada match sama sekali.
 *
 * `txDate` formatnya `YYYY-MM-DD`. Dipakai untuk fallback year ketika
 * note hanya menyebut bulan tanpa tahun (mis. "Gaji Maret").
 *
 * 2-digit year (mis. "26") diasumsikan 20XX. 4-digit year dipakai
 * apa adanya selama plausible (2000-2099). Year di luar range = null
 * → fallback ke tx-year.
 *
 * False-positive note: kata "Mei" / "Mar" / "Jan" bisa kebetulan
 * nama orang. Konsekuensi: tx pencatatan ke effective_period yang
 * salah; admin override via UI. Trade-off ini di-accept supaya
 * coverage tinggi untuk bulk-payment notes ("Gaji Maret 2026", dll).
 */
export function extractEffectivePeriod(
  description: string | null | undefined,
  txDate: string
): { month: number; year: number } | null {
  if (!description) return null;
  const m = MONTH_REGEX.exec(description);
  if (!m) return null;
  const monthName = m[1].toLowerCase();
  const month = MONTH_NAME_TO_NUM[monthName];
  if (!month) return null;

  const txYear = Number(txDate.slice(0, 4));
  let year = txYear;
  if (m[2]) {
    const raw = Number(m[2]);
    if (m[2].length === 2) {
      year = 2000 + raw;
    } else if (raw >= 2000 && raw <= 2099) {
      year = raw;
    }
  }
  return { month, year };
}
