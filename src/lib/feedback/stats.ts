/**
 * Hitungan feedback untuk scorecard cabang. Modul murni.
 *
 * Warna kartu: dari rata-rata bintang (ambang yang diatur owner). Bila jumlah feedback di jendela 30 hari belum mencapai
 * target (5 per hari), kartu yang seharusnya hijau turun ke kuning; merah hanya karena rata-rata bintang di bawah batas
 * merah, bukan karena jumlah.
 */

import { feedbackBandOf, type BranchThresholds } from "../scorecard/thresholds.ts";
import { FEEDBACK_DAILY_TARGET, FEEDBACK_WINDOW_DAYS } from "./constants.ts";

export type FeedbackBand = "green" | "yellow" | "red";

export interface FeedbackWindowStats {
  count: number;
  average: number | null;
  /** Jumlah hari yang dihitung untuk target: 30, atau lebih sedikit bila feedback pertama baru masuk. */
  days: number;
  targetCount: number;
  countMet: boolean;
  band: FeedbackBand | null;
}

const DAY_MS = 86_400_000;
const dayIndex = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/**
 * Jumlah hari target yang berlaku pada jendela yang berakhir di `asOf` (YYYY-MM-DD): 30 hari bergulir, tetapi tidak
 * menghitung hari sebelum feedback pertama cabang itu masuk (supaya bulan peluncuran tidak langsung dihukum).
 */
export function targetDays(firstFeedbackDate: string | null, asOf: string, windowDays = FEEDBACK_WINDOW_DAYS): number {
  if (!firstFeedbackDate) return windowDays;
  const sinceFirst = dayIndex(asOf) - dayIndex(firstFeedbackDate) + 1;
  return Math.max(1, Math.min(windowDays, sinceFirst));
}

export function computeFeedbackStats(
  ratings: readonly number[],
  days: number,
  thresholds: BranchThresholds,
  dailyTarget = FEEDBACK_DAILY_TARGET
): FeedbackWindowStats {
  const count = ratings.length;
  const targetCount = days * dailyTarget;
  if (count === 0) return { count, average: null, days, targetCount, countMet: false, band: null };
  const average = ratings.reduce((a, b) => a + b, 0) / count;
  const countMet = count >= targetCount;
  const base = feedbackBandOf(average, thresholds);
  const band: FeedbackBand = base === "green" && !countMet ? "yellow" : base;
  return { count, average, days, targetCount, countMet, band };
}
