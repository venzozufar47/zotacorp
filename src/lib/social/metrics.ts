/**
 * Registry metrik yang bisa dijadikan KPI.
 *
 * Owner sengaja belum memutuskan metrik mana yang menentukan penilaian, jadi
 * daftar ini hidup di TypeScript dan bukan sebagai enum di database:
 * social_kpi_targets.metric_key adalah teks bebas yang divalidasi terhadap
 * registry ini. Konsekuensinya menambah kandidat KPI = satu baris di sini,
 * bukan migration baru.
 *
 * Murni data, tanpa I/O — aman diimpor dari komponen klien maupun server.
 */

export type MetricDirection = "higher_better" | "lower_better";

/** Di mana angkanya bisa dibandingkan dengan adil. */
export type MetricScope = "post" | "account" | "creator";

export interface MetricDef {
  key: string;
  label: string;
  /** Penjelasan singkat untuk tooltip — ditulis untuk manajer, bukan engineer. */
  hint: string;
  scopes: readonly MetricScope[];
  direction: MetricDirection;
  format: "int" | "percent" | "decimal";
  /**
   * Metrik yang TIDAK tersedia di semua platform. UI wajib menampilkan
   * peringatan saat metrik ini dipakai untuk memeringkat lintas platform,
   * karena TikTok Display API tidak menyediakan reach/saves sama sekali —
   * kreator TikTok akan selalu terlihat nol dan itu bukan salah mereka.
   */
  platformGaps?: readonly string[];
}

export const SOCIAL_METRICS: readonly MetricDef[] = [
  {
    key: "posts_count",
    label: "Jumlah konten",
    hint: "Berapa postingan terbit dalam periode. Mengukur disiplin, bukan hasil — sepenuhnya dalam kendali kreator.",
    scopes: ["creator", "account"],
    direction: "higher_better",
    format: "int",
  },
  {
    key: "views_total",
    label: "Total views",
    hint: "Jumlah seluruh penayangan. Mudah dipahami, tapi satu konten viral bisa menutupi konsistensi yang buruk.",
    scopes: ["post", "creator", "account"],
    direction: "higher_better",
    format: "int",
  },
  {
    key: "views_median",
    label: "Median views",
    hint: "Nilai tengah. Lebih jujur dari rata-rata karena tidak diseret satu konten viral.",
    scopes: ["creator", "account"],
    direction: "higher_better",
    format: "int",
  },
  {
    key: "views_24h_avg",
    label: "Rata-rata views 24 jam pertama",
    hint: "Pembanding paling adil antar kreator: menetralkan umur konten, karena konten lama otomatis unggul kalau dihitung total.",
    scopes: ["post", "creator"],
    direction: "higher_better",
    format: "int",
  },
  {
    key: "engagement_rate",
    label: "Engagement rate",
    hint: "(Like + komentar + simpan) dibagi jangkauan. Mengukur kualitas konten, bukan volume — adil antar akun yang ukurannya beda jauh.",
    scopes: ["post", "creator", "account"],
    direction: "higher_better",
    format: "percent",
  },
  {
    key: "likes_total",
    label: "Total like",
    hint: "Sinyal apresiasi paling dangkal, tapi tersedia di semua platform.",
    scopes: ["post", "creator", "account"],
    direction: "higher_better",
    format: "int",
  },
  {
    key: "comments_total",
    label: "Total komentar",
    hint: "Effort penonton lebih tinggi dari like, jadi sinyal kualitas yang lebih kuat.",
    scopes: ["post", "creator", "account"],
    direction: "higher_better",
    format: "int",
  },
  {
    key: "shares_total",
    label: "Total share",
    hint: "Paling dekat dengan pertumbuhan organik — orang mempertaruhkan reputasinya saat membagikan.",
    scopes: ["post", "creator", "account"],
    direction: "higher_better",
    format: "int",
  },
  {
    key: "saves_total",
    label: "Total simpan",
    hint: "Penanda konten bernilai simpan-untuk-nanti.",
    scopes: ["post", "creator", "account"],
    direction: "higher_better",
    format: "int",
    platformGaps: ["tiktok"],
  },
  {
    key: "reach_total",
    label: "Total jangkauan",
    hint: "Jumlah akun unik yang melihat.",
    scopes: ["post", "creator", "account"],
    direction: "higher_better",
    format: "int",
    platformGaps: ["tiktok"],
  },
  {
    key: "follower_growth",
    label: "Pertumbuhan follower",
    hint: "Selisih follower dalam periode. Paling dekat ke hasil bisnis, tapi paling lambat bergerak dan banyak dipengaruhi hal di luar kendali kreator.",
    scopes: ["account"],
    direction: "higher_better",
    format: "int",
  },
  {
    key: "profile_views",
    label: "Kunjungan profil",
    hint: "Seberapa sering konten mendorong orang menengok profil.",
    scopes: ["account"],
    direction: "higher_better",
    format: "int",
    platformGaps: ["tiktok"],
  },
] as const;

export const METRIC_KEYS = SOCIAL_METRICS.map((m) => m.key);

export function getMetric(key: string): MetricDef | undefined {
  return SOCIAL_METRICS.find((m) => m.key === key);
}

export function isValidMetricKey(key: string): boolean {
  return METRIC_KEYS.includes(key);
}

/** Platform yang tidak bisa menyuplai metrik ini — dipakai UI untuk memasang
 *  peringatan alih-alih mengandalkan orang mengingatnya. */
export function metricGaps(key: string): readonly string[] {
  return getMetric(key)?.platformGaps ?? [];
}
