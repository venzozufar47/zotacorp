/**
 * Aturan & hitungan murni shift kasir POS (tanpa database) — dipakai server action dan UI, dan mudah diuji.
 *
 * Kas "seharusnya" dibangun dari LEDGER cashflow rekening kas (sumber kebenaran uang di seluruh aplikasi — termasuk
 * pelunasan kue tunai, selisih opname yang dibayar, dan pengeluaran, yang TIDAK ada di pos_sales), pada jendela
 * waktu tertentu, TANPA baris QRIS (QRIS tidak masuk laci):
 *   + kredit tunai di ledger    − debit di ledger    − refund void atas penjualan dari jendela sebelumnya
 * Void menghapus baris ledger-nya; untuk penjualan yang dibuat di jendela yang SAMA itu sudah impas dengan
 * sendirinya, tapi untuk penjualan dari jendela sebelumnya uangnya sudah terhitung di sana, jadi refund-nya
 * dikurangkan di sini. Pengeluaran bernota shift dikecualikan dari jendela (sudah dihitung eksplisit).
 */

/** Shift terbuka lebih lama dari ini dianggap lupa ditutup: POS terkunci sampai ditutup/ditutup paksa. */
export const STALE_SHIFT_HOURS = 16;

/** Selisih kas (±) sebesar ini atau lebih langsung memicu notifikasi ke admin. */
export const CASH_DIFF_ALERT = 50_000;

/** Kategori ledger yang boleh dipilih kasir untuk pengeluaran bernota (admin merapikan belakangan). */
export const NOTA_CATEGORIES = [
  "Cost of Goods Sold",
  "Office Supplies",
  "Utilities",
  "Maintenance",
  "Shipping Cost",
] as const;
export type NotaCategory = (typeof NOTA_CATEGORIES)[number];

export function isNotaCategory(v: unknown): v is NotaCategory {
  return typeof v === "string" && (NOTA_CATEGORIES as readonly string[]).includes(v);
}

export function isShiftStale(openedAtIso: string, now: Date = new Date()): boolean {
  const opened = new Date(openedAtIso).getTime();
  if (Number.isNaN(opened)) return false;
  return now.getTime() - opened > STALE_SHIFT_HOURS * 3_600_000;
}

export interface CashMovement {
  /** Jumlah kredit ledger non-QRIS dalam jendela. */
  credits: number;
  /** Jumlah debit ledger dalam jendela. */
  debits: number;
  /** Refund void (tunai) dalam jendela atas penjualan yang uangnya masuk SEBELUM jendela. */
  lateRefunds: number;
}

/** Perubahan bersih isi laci dalam jendela (di luar pengeluaran bernota shift). */
export function netCash(m: CashMovement): number {
  return m.credits - m.debits - m.lateRefunds;
}

/**
 * Kas seharusnya saat BUKA shift: hitungan kas penutup shift sebelumnya − uang yang diambil/disetor setelah
 * hitungan itu + gerakan kas di luar shift − pengeluaran bernota yang dicatat saat buka. null = tidak ada pembanding (shift pertama, atau shift
 * sebelumnya ditutup paksa sehingga tidak punya hitungan).
 */
export function expectedOpeningCash(
  prevCounted: number | null,
  prevWithdrawn: number,
  netBetween: number,
  openExpensesTotal: number
): number | null {
  if (prevCounted === null) return null;
  return prevCounted - prevWithdrawn + netBetween - openExpensesTotal;
}

/**
 * Modal laci standar yang disisakan saat tutup shift; selebihnya (pemasukan hari itu) diambil/disetor.
 * Hanya nilai awal isian "uang diambil" — kasir boleh mengubahnya.
 */
export const DEFAULT_DRAWER_FLOAT = 300_000;

/** Kas seharusnya saat TUTUP shift: hitungan buka + gerakan kas selama shift − pengeluaran bernota saat tutup. */
export function expectedClosingCash(
  openCounted: number,
  netDuring: number,
  closeExpensesTotal: number
): number {
  return openCounted + netDuring - closeExpensesTotal;
}

export function sumExpenses(expenses: Array<{ amount: number }>): number {
  return expenses.reduce((s, e) => s + e.amount, 0);
}

export function isCashDiffAlert(diff: number | null): boolean {
  return diff !== null && Math.abs(diff) >= CASH_DIFF_ALERT;
}

/** "Kas sesuai" / "Kurang Rp 5.000" / "Lebih Rp 5.000" — untuk layar hasil dan notifikasi. */
export function describeCashDiff(diff: number | null): string {
  if (diff === null) return "Tidak ada pembanding";
  if (diff === 0) return "Kas sesuai";
  const rp = `Rp ${Math.abs(diff).toLocaleString("id-ID")}`;
  return diff < 0 ? `Kurang ${rp}` : `Lebih ${rp}`;
}

/** Ringkasan aktivitas di luar shift sejak shift terakhir ditutup — disajikan ke kasir pembuka shift berikutnya. */
export interface IncidentalReport {
  /** Awal jendela (tutup shift terakhir); null = belum pernah ada shift. */
  from: string | null;
  to: string;
  salesCount: number;
  cashIn: number;
  qrisIn: number;
  pendingCount: number;
  voidCount: number;
  voidTotal: number;
  /** Perubahan bersih isi laci menurut ledger (termasuk pelunasan kue, dll. — bukan hanya penjualan POS). */
  cashNet: number;
  soldItems: Array<{ name: string; qty: number }>;
  movements: Array<{ type: "production" | "withdrawal"; name: string; qty: number; by: string | null }>;
  byUser: Array<{ name: string; count: number; total: number }>;
}

/** Ada sesuatu yang perlu dilaporkan? (laporan kosong tidak perlu layar tersendiri.) */
export function incidentalReportHasContent(r: IncidentalReport | null): boolean {
  if (!r) return false;
  return (
    r.salesCount > 0 ||
    r.voidCount > 0 ||
    r.movements.length > 0 ||
    r.cashNet !== 0
  );
}
