/**
 * Mesin murni Scorecard Unit Bisnis: status per metrik, status unit, ramp-up, gerbang kelengkapan data,
 * eskalasi merah, dan tren. Tanpa import apa pun (dijalankan langsung oleh `node --test` dan dipakai server).
 * Seluruh nilai persentase berupa poin persen (35 = 35%).
 */

export type Direction = "higher_better" | "lower_better";

/** Status satu metrik. `incomplete` = data belum lengkap; `not_assessed` = input kosong. Keduanya tak pernah dihitung hijau. */
export type MetricStatus = "green" | "yellow" | "red" | "incomplete" | "not_assessed";

/** Status unit. `rampup` abu-abu (unit baru buka); `incomplete` = tak ada merah tetapi margin four-wall belum bisa dinilai. */
export type UnitStatus = "green" | "yellow" | "red" | "rampup" | "incomplete" | "no_data";

export interface Threshold {
  /** Batas hijau: lower_better → nilai ≤ batas; higher_better → nilai ≥ batas. */
  green: number;
  /** Batas merah: lower_better → nilai > batas merah; higher_better → nilai < batas merah. */
  red: number;
}

/** Pembulatan 1 desimal yang sama dengan tampilan, agar "35,0%" di layar = status yang dipakai. */
export function roundValue(v: number): number {
  return Math.round((v + Number.EPSILON) * 10) / 10;
}

/**
 * Nilai tepat di batas masuk status lebih baik: lower_better 35,0 dengan batas hijau 35 → hijau;
 * higher_better 8,0 dengan batas merah 8 → kuning.
 */
export function metricStatus(
  value: number | null | undefined,
  direction: Direction,
  th: Threshold
): "green" | "yellow" | "red" | "not_assessed" {
  if (value == null || !Number.isFinite(value)) return "not_assessed";
  const v = roundValue(value);
  if (direction === "lower_better") {
    if (v <= th.green) return "green";
    if (v <= th.red) return "yellow";
    return "red";
  }
  if (v >= th.green) return "green";
  if (v >= th.red) return "yellow";
  return "red";
}

export function pct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

/** Revenue yang HPP-nya lengkap ≥ 90% dari total revenue. Total 0 → belum bisa dinilai. */
export const HPP_COVERAGE_MIN = 0.9;
export function hppCoverageOk(coveredRevenue: number, totalRevenue: number, min = HPP_COVERAGE_MIN): boolean {
  if (!(totalRevenue > 0)) return false;
  return coveredRevenue / totalRevenue >= min - 1e-9;
}

export interface FourWallInput {
  revenue: number;
  hpp: number;
  labor: number;
  rent: number;
  /** Biaya operasional langsung unit (di luar HPP, gaji, sewa, fee). */
  directOpex: number;
  /** Fee pembayaran / platform. */
  fees: number;
}

/** (Revenue − HPP − tenaga kerja − sewa − biaya langsung − fee) ÷ Revenue, poin persen. Tanpa overhead & penyusutan. */
export function fourWallMargin(i: FourWallInput): number | null {
  return pct(i.revenue - i.hpp - i.labor - i.rent - i.directOpex - i.fees, i.revenue);
}

export function fourWallProfit(i: FourWallInput): number {
  return i.revenue - i.hpp - i.labor - i.rent - i.directOpex - i.fees;
}

/**
 * Payback = modal awal ÷ rata-rata laba four-wall bulanan (rupiah). `never` = laba rata-rata ≤ 0, modal tak kembali
 * (dinilai merah). Modal kosong → tak dinilai.
 */
export function paybackMonths(
  capex: number,
  monthlyProfits: number[]
): { months: number | null; never: boolean; assessed: boolean } {
  if (!(capex > 0) || monthlyProfits.length === 0) return { months: null, never: false, assessed: false };
  const avg = monthlyProfits.reduce((s, p) => s + p, 0) / monthlyProfits.length;
  if (avg <= 0) return { months: null, never: true, assessed: true };
  return { months: capex / avg, never: false, assessed: true };
}

export interface UnitMetricStatus {
  code: string;
  status: MetricStatus;
  /** True untuk margin four-wall (B4 / S3). */
  isFourWall: boolean;
}

export interface UnitStatusResult {
  status: UnitStatus;
  redCount: number;
  yellowCount: number;
}

/**
 * Merah bila four-wall merah ATAU ≥ 2 metrik merah. Kuning bila ≥ 1 merah atau ≥ 2 kuning. Selain itu hijau —
 * kecuali margin four-wall belum bisa dinilai: unit tak boleh tampil hijau tanpa angka terpenting, jadi `incomplete`.
 * Unit ramp-up selalu `rampup` (hitungan merah/kuning tetap dikembalikan untuk ditampilkan).
 */
export function unitStatus(metrics: UnitMetricStatus[], opts: { rampUp: boolean }): UnitStatusResult {
  const evaluated = metrics.filter((m) => m.status === "green" || m.status === "yellow" || m.status === "red");
  const redCount = evaluated.filter((m) => m.status === "red").length;
  const yellowCount = evaluated.filter((m) => m.status === "yellow").length;
  if (opts.rampUp) return { status: "rampup", redCount, yellowCount };
  if (evaluated.length === 0) return { status: "no_data", redCount, yellowCount };
  const fourWall = metrics.find((m) => m.isFourWall);
  if (fourWall?.status === "red" || redCount >= 2) return { status: "red", redCount, yellowCount };
  if (redCount >= 1 || yellowCount >= 2) return { status: "yellow", redCount, yellowCount };
  if (fourWall && fourWall.status !== "green" && fourWall.status !== "yellow") {
    return { status: "incomplete", redCount, yellowCount };
  }
  return { status: "green", redCount, yellowCount };
}

/** Tanggal buka / buka kembali masih dalam masa ramp-up bila awal periode < ramp_up_until. */
export function isRampUp(periodStartIso: string, rampUpUntilIso: string | null | undefined): boolean {
  if (!rampUpUntilIso) return false;
  return periodStartIso.slice(0, 10) < rampUpUntilIso.slice(0, 10);
}

/** Merah pada dua periode tutup buku BERURUTAN (bulan bersebelahan) menjadi terkonfirmasi. */
export function isConfirmedRed(
  prev: { status: UnitStatus; monthIso: string } | null | undefined,
  cur: { status: UnitStatus; monthIso: string }
): boolean {
  if (!prev || prev.status !== "red" || cur.status !== "red") return false;
  return nextMonthIso(prev.monthIso) === cur.monthIso.slice(0, 7) + "-01";
}

/** "2026-05-01" → "2026-06-01". */
export function nextMonthIso(monthIso: string): string {
  const y = Number(monthIso.slice(0, 4));
  const m = Number(monthIso.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** "2026-05-01" → "2026-04-01". */
export function prevMonthIso(monthIso: string): string {
  const y = Number(monthIso.slice(0, 4));
  const m = Number(monthIso.slice(5, 7));
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
}

export type TrendTone = "better" | "worse" | "flat";

/** Warna panah mengikuti arah baik/buruk metrik, bukan naik/turunnya angka. */
export function trendTone(delta: number | null | undefined, direction: Direction): TrendTone {
  if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < 0.05) return "flat";
  const up = delta > 0;
  return (direction === "higher_better") === up ? "better" : "worse";
}
