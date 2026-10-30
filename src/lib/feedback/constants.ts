/**
 * Feedback pelanggan Haengbocake: konstanta bersama halaman publik, halaman admin, POS, dan scorecard.
 * Modul biasa (bukan "use server") agar boleh mengekspor konstanta.
 */

export type FeedbackBranch = "Pare" | "Semarang";

/** Segmen URL → cabang dan nama merek yang tampil ke pelanggan. */
export const FEEDBACK_SLUGS: Record<string, { branch: FeedbackBranch; brand: string }> = {
  pare: { branch: "Pare", brand: "Haengbocorner Pare" },
  semarang: { branch: "Semarang", brand: "Haengbocake Semarang" },
};

export function feedbackSlugOf(branch: FeedbackBranch): string {
  return branch.toLowerCase();
}

export type VisitType = "first" | "returning";
export const VISIT_OPTIONS: { value: VisitType; label: string }[] = [
  { value: "first", label: "Baru pertama kali datang" },
  { value: "returning", label: "Sudah pernah datang sebelumnya" },
];

/** Tombol cepat untuk pertanyaan "Apakah kakak ada masukan untuk kami?". Urutan = urutan tampil. */
export const FEEDBACK_ASPECTS = [
  { key: "kebersihan", label: "Kebersihan" },
  { key: "rasa", label: "Rasa produk" },
  { key: "kesegaran", label: "Kesegaran produk" },
  { key: "variasi", label: "Variasi produk" },
  { key: "ketersediaan", label: "Ketersediaan produk" },
  { key: "harga", label: "Harga" },
  { key: "pelayanan", label: "Pelayanan karyawan" },
  { key: "kecepatan", label: "Kecepatan layanan" },
  { key: "kenyamanan", label: "Kenyamanan tempat" },
  { key: "tampilan", label: "Tampilan dan kemasan" },
  { key: "sudah_bagus", label: "Sudah bagus semua" },
] as const;

export type FeedbackAspectKey = (typeof FEEDBACK_ASPECTS)[number]["key"];
/** Satu-satunya tombol positif murni; bila dipilih, tombol lain dilepas. */
export const ASPECT_ALL_GOOD: FeedbackAspectKey = "sudah_bagus";

export const ASPECT_LABEL: Record<string, string> = Object.fromEntries(FEEDBACK_ASPECTS.map((a) => [a.key, a.label]));

export const RATING_LABELS = ["", "Tidak puas", "Kurang puas", "Cukup", "Puas", "Sangat puas"] as const;

export const COMMENT_MAX = 500;
export const WISH_MAX = 200;

/** Target jumlah feedback masuk per hari per cabang (kartu POS dan penentu warna kartu scorecard). */
export const FEEDBACK_DAILY_TARGET = 5;
/** Jendela scorecard: rata-rata bintang dan jumlah feedback 30 hari terakhir. */
export const FEEDBACK_WINDOW_DAYS = 30;
