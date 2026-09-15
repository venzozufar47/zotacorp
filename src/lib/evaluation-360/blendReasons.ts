import type { Evaluation360MetricKey } from "./rubric";
import type { RoundResponseDTO } from "@/lib/actions/evaluation-360.actions";
import { EVALUATION_360_METRICS } from "./rubric";

/**
 * Gabungkan teks bebas dari beberapa evaluator (alasan per metrik,
 * apresiasi, catatan) jadi SATU PDF per karyawan tanpa membocorkan siapa
 * menulis yang mana — tidak ada AI rewrite (biaya/kompleksitas tidak
 * sepadan, lihat diskusi produk). Tiap bagian jadi daftar "Poin 1, Poin
 * 2, ..." bernomor URUT POSISI, BUKAN per-evaluator — urutan diacak
 * SECARA INDEPENDEN di tiap bagian, jadi "Poin 1" di satu metrik dan
 * "Poin 1" di metrik lain tidak boleh diasumsikan berasal dari orang
 * yang sama. Tidak ada label nama/inisial evaluator dalam bentuk apa
 * pun — nomor urut murni posisional, dibuang begitu digenerate ulang.
 */

function shuffle<T>(arr: T[]): T[] {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Teks bersih (trim, buang kosong), urutan diacak — SIAP dinomori
 *  sebagai "Poin 1/2/3" di UI, bukan digabung jadi satu paragraf. */
function blendTexts(texts: string[]): string[] {
  const cleaned = texts.map((t) => t.trim()).filter(Boolean);
  return shuffle(cleaned);
}

export function blendMetricReasons(
  responses: RoundResponseDTO[]
): Record<Evaluation360MetricKey, string[]> {
  const result = {} as Record<Evaluation360MetricKey, string[]>;
  for (const metric of EVALUATION_360_METRICS) {
    const texts = responses
      .map((r) => r.metricScores[metric.key]?.reason)
      .filter((r): r is string => Boolean(r));
    result[metric.key] = blendTexts(texts);
  }
  return result;
}

export function blendApresiasi(responses: RoundResponseDTO[]): string[] {
  return blendTexts(responses.map((r) => r.apresiasi));
}

export function blendNotes(responses: RoundResponseDTO[]): string[] {
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
