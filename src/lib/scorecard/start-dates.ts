/**
 * Reset per cabang: seluruh angka cabang ini hanya menghitung data SEJAK
 * tanggal ini (WIB, YYYY-MM-DD). Data sumber (penjualan, stok, snapshot
 * service level, feedback) tidak dihapus — hanya dikecualikan dari hitungan.
 * Cabang yang tidak tercantum = tanpa batas.
 *
 * SATU sumber untuk Scorecard Cabang (termasuk Kalkulator Bonus) DAN Service
 * Level di POS/dashboard, supaya angka keduanya selalu dimulai dari tanggal
 * yang sama. Kuncinya `bank_accounts.default_branch` / `ScorecardBranch`.
 */
export const SCORECARD_START: Partial<Record<string, string>> = {
  Semarang: "2026-11-16",
};

/** Tanggal mulai cabang, atau null bila cabang tanpa batas/tidak dikenal. */
export function scorecardStartFor(branch: string | null | undefined): string | null {
  return (branch ? SCORECARD_START[branch] : undefined) ?? null;
}
