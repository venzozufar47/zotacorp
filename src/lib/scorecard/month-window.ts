import { workingDaysBetween } from "./working-days.ts";

/**
 * Mulai tanggal ini (WIB) metrik cabang dihitung dari tanggal 1 bulan berjalan, bukan 30 hari bergulir, dan 3 hari kerja
 * pertama tiap bulan berstatus "Diukur" (angka tampil, belum diberi warna). Sebelum tanggal ini aturan lama berlaku.
 */
export const MONTH_TO_DATE_FROM = "2026-12-01";
export const EARLY_WORKDAYS = 3;

export const isMonthToDate = (asOf: string) => asOf >= MONTH_TO_DATE_FROM;

/** Awal jendela waste, service level, dan feedback untuk tampilan yang berakhir di `asOf` (YYYY-MM-DD). */
export function metricWindowStart(asOf: string): string {
  if (isMonthToDate(asOf)) return `${asOf.slice(0, 8)}01`;
  return new Date(Date.parse(`${asOf}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
}

/** Jumlah hari jendela yang berakhir di `asOf`: 30, atau tanggal hari itu sejak aturan tanggal 1. */
export const metricWindowDays = (asOf: string) => (isMonthToDate(asOf) ? Number(asOf.slice(8, 10)) : 30);

export const metricWindowName = (asOf: string) => (isMonthToDate(asOf) ? "bulan ini" : "30 hari terakhir");

/**
 * Hari kerja ke berapa bila `asOf` masih dalam masa "Diukur" (0 = bulan baru mulai di hari libur); null = sudah dinilai.
 * `from` = awal hitungan bulan itu (tanggal 1, atau tanggal mulai cabang).
 */
export function earlyWorkday(from: string, asOf: string): number | null {
  if (!isMonthToDate(asOf)) return null;
  const n = workingDaysBetween(from, asOf);
  return n <= EARLY_WORKDAYS ? n : null;
}
