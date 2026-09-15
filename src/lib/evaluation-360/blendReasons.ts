import type { Evaluation360MetricKey } from "./rubric";
import type { RoundResponseDTO } from "@/lib/actions/evaluation-360.actions";
import { EVALUATION_360_METRICS } from "./rubric";

/**
 * Gabungkan teks bebas dari beberapa evaluator (alasan per metrik,
 * apresiasi, catatan) jadi SATU PDF per karyawan tanpa membocorkan siapa
 * menulis yang mana — tidak ada AI rewrite (biaya/kompleksitas tidak
 * sepadan, lihat diskusi produk), cukup: urutan diacak SECARA
 * INDEPENDEN di tiap bagian (supaya "urutan ke-2 di semua metrik selalu
 * orang yang sama" tidak bisa dipakai buat menebak), lalu digabung jadi
 * satu paragraf mengalir tanpa bullet/label per orang.
 */

function shuffle<T>(arr: T[]): T[] {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Pastikan tiap potongan diakhiri tanda baca sebelum digabung. */
function withEndingPunctuation(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function blendTexts(texts: string[]): string {
  const cleaned = texts.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return "—";
  return shuffle(cleaned).map(withEndingPunctuation).join(" ");
}

export function blendMetricReasons(
  responses: RoundResponseDTO[]
): Record<Evaluation360MetricKey, string> {
  const result = {} as Record<Evaluation360MetricKey, string>;
  for (const metric of EVALUATION_360_METRICS) {
    const texts = responses
      .map((r) => r.metricScores[metric.key]?.reason)
      .filter((r): r is string => Boolean(r));
    result[metric.key] = blendTexts(texts);
  }
  return result;
}

export function blendApresiasi(responses: RoundResponseDTO[]): string {
  return blendTexts(responses.map((r) => r.apresiasi));
}

export function blendNotes(responses: RoundResponseDTO[]): string {
  return blendTexts(responses.map((r) => r.notes));
}

export function averageMetricScores(
  responses: RoundResponseDTO[]
): Record<Evaluation360MetricKey, number> {
  const result = {} as Record<Evaluation360MetricKey, number>;
  for (const metric of EVALUATION_360_METRICS) {
    const scores = responses
      .map((r) => r.metricScores[metric.key]?.score)
      .filter((s): s is number => typeof s === "number");
    result[metric.key] =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : 0;
  }
  return result;
}
