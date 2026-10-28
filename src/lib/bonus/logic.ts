/**
 * Rumus Kalkulator Bonus Tim (Perjanjian Kerja Lampiran C), murni agar bisa diuji:
 *   kolam = p% × max(0, LK aktual − LK dasar) × (poin scorecard / 4)
 * dan pembagian kolam SAMA RATA di antara penerima yang berhak.
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
  excluded: boolean;
}

/**
 * Bagian tiap penerima = kolam ÷ jumlah penerima yang berhak (sama rata). Penerima yang dikecualikan (SP aktif / tidak
 * aktif) mendapat 0 dan bagiannya dibagi ke yang lain. Bila semua dikecualikan, semua 0.
 */
export function distributeShares(pool: number, rows: ShareInput[]): number[] {
  const eligible = rows.filter((r) => !r.excluded).length;
  if (eligible === 0) return rows.map(() => 0);
  return rows.map((r) => (r.excluded ? 0 : pool / eligible));
}
