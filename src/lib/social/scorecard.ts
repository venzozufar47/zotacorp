/**
 * Scorecard Sosmed per unit bisnis: logika hitung murni (tanpa DB) supaya bisa diuji langsung.
 *
 * Hasil akhir (omset, followers, impressions, reach, engagement) dinilai sebagai PENCAPAIAN terhadap
 * target bulanan: skor = nilai aktual ÷ target × 100. Proses (kalender, stok cadangan, balasan) dinilai
 * sebagai persentase langsung. Semua metrik "makin tinggi makin baik"; ambang hijau/kuning/merah
 * tersimpan per unit di `social_scorecard_config` dan bisa diubah superadmin (wajib alasan).
 */

import { metricStatus, pct, roundValue, type MetricStatus } from "../unit-scorecard/engine.ts";

export type SocialMetricCode =
  | "omset"
  | "followers"
  | "impressions"
  | "reach"
  | "engagement"
  | "p_kalender"
  | "p_stok"
  | "p_balasan";

export type MetricGroup = "hasil" | "proses";
export type ValueKind = "rupiah" | "count" | "pct";

export interface SocialMetricDef {
  code: SocialMetricCode;
  group: MetricGroup;
  label: string;
  /** Satuan nilai aktual & target. */
  kind: ValueKind;
  /** Penjelasan singkat cara hitung, ditampilkan di UI. */
  note: string;
}

export const SOCIAL_METRICS: SocialMetricDef[] = [
  { code: "omset", group: "hasil", label: "Omset", kind: "rupiah", note: "Total penjualan unit pada bulan itu (POS + custom cake untuk Haengbocake; laba-rugi untuk Yeobo Space)." },
  { code: "followers", group: "hasil", label: "Pertumbuhan followers", kind: "count", note: "Followers bersih bertambah pada bulan itu, semua akun unit." },
  { code: "impressions", group: "hasil", label: "Impressions", kind: "count", note: "Total tayangan semua akun unit dalam bulan itu." },
  { code: "reach", group: "hasil", label: "Reach", kind: "count", note: "Jumlah harian reach dijumlahkan, semua akun unit." },
  { code: "engagement", group: "hasil", label: "Engagement rate", kind: "pct", note: "(like + komentar + share + simpan) ÷ reach untuk postingan yang tayang pada bulan itu." },
  { code: "p_kalender", group: "proses", label: "Unggahan tayang sesuai kalender", kind: "pct", note: "Unggahan tayang tepat waktu ÷ unggahan terjadwal, dari input mingguan." },
  { code: "p_stok", group: "proses", label: "Stok konten cadangan terpenuhi", kind: "pct", note: "Persentase minggu dengan stok cadangan ≥ minimum (target = jumlah minimum konten)." },
  { code: "p_balasan", group: "proses", label: "Pesan & komentar terbalas tepat waktu", kind: "pct", note: "Pesan + komentar dibalas dalam batas waktu ÷ yang masuk, dari input mingguan." },
];

export const SOCIAL_METRIC_BY_CODE = new Map(SOCIAL_METRICS.map((m) => [m.code, m]));

export interface WeeklyRow {
  weekStart: string;
  postsScheduled: number;
  postsOnTime: number;
  backupStock: number;
  messagesReceived: number;
  messagesRepliedOnTime: number;
  commentsReceived: number;
  commentsRepliedOnTime: number;
}

export interface ProcessValues {
  weeks: number;
  kalender: number | null;
  stok: number | null;
  balasan: number | null;
  /** Rincian pembilang/penyebut untuk panel rincian. */
  detail: {
    postsScheduled: number;
    postsOnTime: number;
    weeksWithStock: number;
    messagesReceived: number;
    messagesRepliedOnTime: number;
    commentsReceived: number;
    commentsRepliedOnTime: number;
  };
}

/** Agregat input mingguan sebulan. `minStock` = jumlah minimum konten cadangan (null → stok tidak dinilai). */
export function aggregateWeekly(rows: WeeklyRow[], minStock: number | null): ProcessValues {
  let sched = 0;
  let onTime = 0;
  let msg = 0;
  let msgOk = 0;
  let com = 0;
  let comOk = 0;
  let stocked = 0;
  for (const r of rows) {
    sched += r.postsScheduled;
    onTime += r.postsOnTime;
    msg += r.messagesReceived;
    msgOk += r.messagesRepliedOnTime;
    com += r.commentsReceived;
    comOk += r.commentsRepliedOnTime;
    if (minStock != null && r.backupStock >= minStock) stocked += 1;
  }
  return {
    weeks: rows.length,
    kalender: pct(onTime, sched),
    stok: minStock != null && rows.length > 0 ? (stocked / rows.length) * 100 : null,
    balasan: pct(msgOk + comOk, msg + com),
    detail: {
      postsScheduled: sched,
      postsOnTime: onTime,
      weeksWithStock: stocked,
      messagesReceived: msg,
      messagesRepliedOnTime: msgOk,
      commentsReceived: com,
      commentsRepliedOnTime: comOk,
    },
  };
}

/** Pencapaian % terhadap target; target kosong/0 → null (belum bisa dinilai). */
export function achievementPct(actual: number | null | undefined, target: number | null | undefined): number | null {
  if (actual == null || !Number.isFinite(actual)) return null;
  if (target == null || !(target > 0)) return null;
  return (actual / target) * 100;
}

export interface PostAgg {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
}

/** Engagement rate % dari postingan sebulan. Tanpa reach sama sekali → null (jangan menebak). */
export function engagementRate(posts: PostAgg[]): number | null {
  let inter = 0;
  let reach = 0;
  for (const p of posts) {
    if (p.reach == null || !(p.reach > 0)) continue;
    reach += p.reach;
    inter += (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0) + (p.saves ?? 0);
  }
  return pct(inter, reach);
}

export interface ConfigVersion {
  metricCode: SocialMetricCode;
  targetValue: number | null;
  greenBound: number;
  redBound: number;
  effectiveFrom: string;
  createdAt: string;
}

/** Konfigurasi yang berlaku untuk bulan `monthIso`: versi terbaru dengan effective_from ≤ awal bulan. */
export function pickConfig(versions: ConfigVersion[], monthIso: string): ConfigVersion | null {
  let best: ConfigVersion | null = null;
  for (const v of versions) {
    if (v.effectiveFrom > monthIso) continue;
    if (!best || v.effectiveFrom > best.effectiveFrom || (v.effectiveFrom === best.effectiveFrom && v.createdAt > best.createdAt)) best = v;
  }
  return best;
}

export interface ScoredMetric {
  code: SocialMetricCode;
  /** Nilai aktual dalam satuan metrik (rupiah / jumlah / %). null = belum ada data. */
  actual: number | null;
  target: number | null;
  /** Skor yang dinilai terhadap ambang (pencapaian % untuk hasil, persentase untuk proses). */
  score: number | null;
  status: MetricStatus;
  note?: string;
}

/**
 * Skor + status satu metrik.
 *  - hasil: skor = pencapaian terhadap target; target kosong → "belum dinilai" (not_assessed), data kosong → incomplete
 *  - proses: skor = nilai persentase; data kosong → incomplete
 */
export function scoreMetric(
  def: SocialMetricDef,
  actual: number | null,
  cfg: ConfigVersion | null
): ScoredMetric {
  const target = cfg?.targetValue ?? null;
  const base = { code: def.code, actual: actual == null ? null : roundValue(actual), target };
  if (!cfg) return { ...base, score: null, status: "not_assessed", note: "Ambang belum diatur." };
  const th = { green: cfg.greenBound, red: cfg.redBound };

  if (def.group === "hasil") {
    if (target == null || !(target > 0)) return { ...base, score: null, status: "not_assessed", note: "Target bulanan belum diisi." };
    if (actual == null) return { ...base, score: null, status: "incomplete", note: "Belum ada data bulan ini." };
    const score = achievementPct(actual, target);
    return { ...base, score: score == null ? null : roundValue(score), status: metricStatus(score, "higher_better", th) };
  }
  if (actual == null) return { ...base, score: null, status: "incomplete", note: "Belum ada input mingguan bulan ini." };
  return { ...base, score: roundValue(actual), status: metricStatus(actual, "higher_better", th) };
}

/** Senin awal minggu (ISO) dari tanggal "YYYY-MM-DD". */
export function mondayOf(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

/** Awal bulan "YYYY-MM-01" dan awal bulan berikutnya. */
export function monthRange(monthIso: string): { from: string; toExcl: string } {
  const y = Number(monthIso.slice(0, 4));
  const m = Number(monthIso.slice(5, 7));
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from: `${y}-${String(m).padStart(2, "0")}-01`, toExcl: next };
}
