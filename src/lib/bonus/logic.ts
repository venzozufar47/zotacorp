/**
 * Rumus Kalkulator Bonus Tim (Perjanjian Kerja Lampiran C), murni agar bisa diuji:
 *   kolam = p% × max(0, LK aktual − LK dasar) × (poin scorecard / 4)
 * dan pembagian kolam menurut jam hadir di antara penerima yang berhak.
 */

/** Poin satu metrik scorecard: merah 0, kuning 0,5, selain itu 1 (hijau, belum diukur, atau belum diatur → manfaat keraguan ke tim). */
export function scorecardPoints(band: string): number {
  if (band === "red") return 0;
  if (band === "yellow") return 0.5;
  return 1;
}

export function bonusPool(grossProfit: number, lkDasar: number, p: number, multiplier: number): number {
  return (p / 100) * Math.max(0, grossProfit - lkDasar) * multiplier;
}

export interface ShareInput {
  hours: number;
  excluded: boolean;
}

/**
 * Bagian tiap penerima = kolam × (jam hadirnya ÷ total jam penerima yang berhak). Penerima yang dikecualikan atau tanpa
 * jam hadir mendapat 0. Bila total jam 0, semua 0 (kolam belum bisa dibagi).
 */
export function distributeShares(pool: number, rows: ShareInput[]): number[] {
  const total = rows.reduce((s, r) => s + (r.excluded ? 0 : Math.max(0, r.hours)), 0);
  if (total <= 0) return rows.map(() => 0);
  return rows.map((r) => (r.excluded ? 0 : (pool * Math.max(0, r.hours)) / total));
}
