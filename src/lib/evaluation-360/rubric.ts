/**
 * Rubrik Evaluasi 360° — murni (tanpa I/O). 5 metrik tetap (tidak diedit
 * admin), diambil persis dari lembar evaluasi kertas yang dipakai
 * sebelumnya. Skor 1–10 + alasan wajib per metrik; total = jumlah 5 skor.
 */

export type Evaluation360MetricKey =
  | "inisiatif"
  | "pemecahan_masalah"
  | "komunikasi"
  | "pelayanan"
  | "kerjasama";

export interface Evaluation360Metric {
  key: Evaluation360MetricKey;
  title: string;
  definition: string;
  indicators: string[];
}

export const EVALUATION_360_METRICS: Evaluation360Metric[] = [
  {
    key: "inisiatif",
    title: "Inisiatif & Kepekaan Kerja",
    definition:
      "Mengenali kebutuhan dan prioritas pekerjaan secara mandiri, lalu bertindak tepat waktu tanpa harus diingatkan berulang kali.",
    indicators: [
      "Peka terhadap urutan & dampak suatu tindakan",
      "Cepat tanggap terhadap perubahan situasi",
      "Menerapkan arahan yang sudah pernah diberikan",
    ],
  },
  {
    key: "pemecahan_masalah",
    title: "Pemecahan Masalah",
    definition:
      "Mengidentifikasi akar masalah dan memberikan solusi yang tepat sasaran, bukan sekadar solusi yang asal jalan.",
    indicators: [
      "Menganalisis situasi sebelum bertindak",
      "Solusi relevan dengan masalah yang dihadapi",
      "Mampu menilai apakah solusinya berhasil",
    ],
  },
  {
    key: "komunikasi",
    title: "Komunikasi Efektif",
    definition:
      "Menyampaikan informasi secara jelas, ringkas, dan mudah dipahami oleh lawan bicara.",
    indicators: [
      "Penjelasan langsung ke inti (tidak berputar-putar)",
      "Disesuaikan dengan tingkat pemahaman lawan bicara",
      "Tidak menimbulkan kebingungan tambahan",
    ],
  },
  {
    key: "pelayanan",
    title: "Orientasi Pelayanan Pelanggan",
    definition:
      "Membangun interaksi yang ramah, percaya diri, dan nyaman bagi customer sesuai standar layanan studio.",
    indicators: [
      "Nada bicara natural & hangat (bukan kaku atau terlalu formal)",
      "Suara terdengar jelas",
      "Tampil percaya diri saat berinteraksi dengan customer",
    ],
  },
  {
    key: "kerjasama",
    title: "Kerjasama Tim",
    definition:
      "Berkoordinasi dan bekerja sama dengan rekan kerja demi mencapai target bersama.",
    indicators: [
      "Komunikasi aktif dengan tim",
      "Saling membantu tanpa diminta",
      "Menyelesaikan gesekan/konflik secara konstruktif",
    ],
  },
];

export const EVALUATION_360_MAX_TOTAL = EVALUATION_360_METRICS.length * 10;

export interface Evaluation360MetricScore {
  score: number;
  reason: string;
}

export type Evaluation360MetricScores = Record<
  Evaluation360MetricKey,
  Evaluation360MetricScore
>;

/** Validasi lengkap sebelum submit — null berarti valid. */
export function validateMetricScores(
  scores: Evaluation360MetricScores
): string | null {
  if (!scores || typeof scores !== "object") return "Jawaban tidak valid.";
  for (const metric of EVALUATION_360_METRICS) {
    const entry = scores[metric.key];
    if (!entry) return `Metrik "${metric.title}" belum diisi.`;
    if (!Number.isInteger(entry.score) || entry.score < 1 || entry.score > 10) {
      return `Skor "${metric.title}" harus bilangan bulat 1–10.`;
    }
    if (!entry.reason || !entry.reason.trim()) {
      return `Alasan & contoh kasus untuk "${metric.title}" wajib diisi.`;
    }
  }
  return null;
}

export function computeTotal(scores: Evaluation360MetricScores): number {
  return EVALUATION_360_METRICS.reduce(
    (sum, metric) => sum + (scores[metric.key]?.score ?? 0),
    0
  );
}
