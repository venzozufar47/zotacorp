/**
 * Kalender bonus: bulan ("YYYY-MM") dan kuartal ("YYYY-Qn"). Murni (tanpa import) supaya bisa dipakai server dan klien
 * serta diuji langsung.
 */

export const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const MONTHS_SHORT_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export const isValidPeriod = (s: string | null | undefined): s is string => !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const isValidQuarter = (s: string | null | undefined): s is string => !!s && /^\d{4}-Q[1-4]$/.test(s);

export function quarterOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${y}-Q${Math.ceil(m / 3)}`;
}

/** Tiga bulan dalam kuartal, berurutan. */
export function monthsOfQuarter(quarter: string): string[] {
  const [y, q] = quarter.split("-Q").map(Number);
  return [1, 2, 3].map((i) => `${y}-${String((q - 1) * 3 + i).padStart(2, "0")}`);
}

export function shiftQuarter(quarter: string, delta: number): string {
  const [y, q] = quarter.split("-Q").map(Number);
  const idx = y * 4 + (q - 1) + delta;
  return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
}

export const quarterLabel = (quarter: string) => `Kuartal ${quarter.split("-Q")[1]} · ${quarter.slice(0, 4)}`;
export const periodLabel = (period: string) => `${MONTHS_ID[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
export const monthShort = (period: string) => MONTHS_SHORT_ID[Number(period.slice(5, 7)) - 1];

/** Hari terakhir bulan sebagai "YYYY-MM-DD". */
export function lastDayOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/** Awal bulan berikutnya "YYYY-MM-01" (batas atas eksklusif). */
export function nextMonthStart(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
