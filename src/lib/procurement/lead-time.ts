/**
 * Lead time pengadaan dalam HARI KERJA (Senin-Sabtu; Minggu toko libur dan tidak dihitung).
 * Murni (tanpa database, tanpa "server-only"): dipakai server dan klien. Tanggal berupa "YYYY-MM-DD" kalender Jakarta.
 */
import { jakartaDateString } from "../utils/jakarta.ts";

/** Lead time bawaan sebelum ada cukup data pesanan nyata. */
export const DEFAULT_LEAD_TIME_DAYS = 4;
/** Jumlah pesanan selesai minimum per bahan sebelum lead time nyata menggantikan bawaan. */
export const MIN_LEAD_SAMPLES = 3;

const DAY_MS = 86_400_000;

const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const isSunday = (ms: number) => new Date(ms).getUTCDay() === 0;

/** Tambah `n` hari kerja (n >= 0) ke tanggal; Minggu dilewati. n = 0 mengembalikan tanggal yang sama. */
export function addWorkingDays(date: string, n: number): string {
  let ms = toUtc(date);
  let left = Math.max(0, Math.round(n));
  while (left > 0) {
    ms += DAY_MS;
    if (!isSunday(ms)) left--;
  }
  return toStr(ms);
}

/** Jumlah hari kerja yang berlalu dari `from` sampai `to` (hari `from` tidak dihitung, `to` dihitung bila bukan Minggu). */
export function workingDaysBetween(from: string, to: string): number {
  const a = toUtc(from);
  const b = toUtc(to);
  if (!(b > a)) return 0;
  let n = 0;
  for (let ms = a + DAY_MS; ms <= b; ms += DAY_MS) if (!isSunday(ms)) n++;
  return n;
}

/** Selisih hari kerja antara dua waktu ISO, menurut tanggal Jakarta. */
export function workingDaysBetweenIso(fromIso: string, toIso: string): number {
  return workingDaysBetween(jakartaDateString(new Date(fromIso)), jakartaDateString(new Date(toIso)));
}

/** Hari kerja lewat dari perkiraan tiba (0 = belum telat). */
export function lateWorkingDays(expectedAt: string | null | undefined, today: string): number {
  if (!expectedAt) return 0;
  return workingDaysBetween(expectedAt, today);
}

export interface LeadTimeStats {
  samples: number;
  mean: number;
  /** Simpangan baku sampel (0 bila satu sampel). */
  sigma: number;
}

export function leadTimeStats(days: number[]): LeadTimeStats | null {
  const xs = days.filter((x) => Number.isFinite(x) && x >= 0);
  if (xs.length === 0) return null;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sigma = xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1)) : 0;
  return { samples: xs.length, mean, sigma };
}

/**
 * Lead time yang dipakai perhitungan: nyata bila sampel cukup, selain itu bawaan 4 hari kerja.
 * `manual` > 0 (diisi admin di parameter bahan) selalu menang.
 */
export function resolveLeadTime(
  manual: number,
  manualSigma: number | null,
  stats: LeadTimeStats | null
): { days: number; sigma: number | null; source: "manual" | "nyata" | "bawaan" } {
  if (manual > 0) return { days: manual, sigma: manualSigma, source: "manual" };
  if (stats && stats.samples >= MIN_LEAD_SAMPLES && stats.mean > 0) {
    return { days: stats.mean, sigma: stats.sigma, source: "nyata" };
  }
  return { days: DEFAULT_LEAD_TIME_DAYS, sigma: manualSigma, source: "bawaan" };
}
