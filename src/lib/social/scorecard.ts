/**
 * Scorecard Sosmed per brand: logika hitung murni (tanpa DB) supaya bisa diuji langsung.
 *
 * Empat metrik, semuanya dihitung dari laporan mingguan per akun (kecuali omset, dari laporan keuangan/POS):
 *   - reach             : jumlah viewers mingguan, semua akun brand
 *   - omset             : penjualan brand pada bulan itu
 *   - followers_growth  : % pertumbuhan followers (akhir bulan vs awal bulan), semua akun brand
 *   - engagement        : interaksi ÷ views × 100
 * Skor = nilai aktual ÷ target × 100, dinilai terhadap ambang hijau/kuning/merah berversi (`social_scorecard_config`).
 * Minggu masuk ke bulan menurut tanggal SENIN-nya.
 */

import { metricStatus, pct, roundValue, type MetricStatus } from "../unit-scorecard/engine.ts";

export type SocialMetricCode = "reach" | "omset" | "followers_growth" | "engagement";
export type ValueKind = "rupiah" | "count" | "pct";

export interface SocialMetricDef {
  code: SocialMetricCode;
  label: string;
  kind: ValueKind;
  /** Penjelasan singkat cara hitung, ditampilkan di UI. */
  note: string;
}

export const SOCIAL_METRICS: SocialMetricDef[] = [
  { code: "reach", label: "Reach (viewers)", kind: "count", note: "Jumlah viewers dari laporan mingguan, semua akun Instagram & TikTok brand ini." },
  { code: "omset", label: "Omset", kind: "rupiah", note: "Total penjualan brand pada bulan itu (cabang yang sesuai)." },
  { code: "followers_growth", label: "Followers growth", kind: "pct", note: "Followers akhir bulan dibanding awal bulan, semua akun brand (dari laporan mingguan)." },
  { code: "engagement", label: "Engagement rate", kind: "pct", note: "Interaksi (like + komentar + share + simpan) ÷ views dari laporan mingguan." },
];

export const SOCIAL_METRIC_BY_CODE = new Map(SOCIAL_METRICS.map((m) => [m.code, m]));

export interface ReportRow {
  accountId: string;
  /** Senin awal minggu (YYYY-MM-DD). */
  weekStart: string;
  views: number;
  viewers: number;
  /** TikTok minggu lewat: viewers tidak bisa diambil (preset 7 hari). `viewers` = 0 dan tidak ikut dihitung. */
  viewersMissing?: boolean;
  interactions: number;
  followers: number;
  follows: number;
  unfollows: number;
  posts: number;
  reels: number;
  stories: number;
}

/** Laporan yang masuk bulan `monthIso` (YYYY-MM-01) menurut tanggal Senin-nya. */
export function reportsInMonth(rows: readonly ReportRow[], monthIso: string): ReportRow[] {
  const { from, toExcl } = monthRange(monthIso);
  return rows.filter((r) => r.weekStart >= from && r.weekStart < toExcl);
}

/** Jumlah viewers; tanpa laporan sama sekali → null (belum ada data, bukan nol). */
export function reachOf(rows: readonly ReportRow[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + r.viewers, 0);
}

/** Engagement rate % = interaksi ÷ views. Tanpa views → null (jangan menebak). */
export function engagementOf(rows: readonly ReportRow[]): number | null {
  const views = rows.reduce((s, r) => s + r.views, 0);
  const inter = rows.reduce((s, r) => s + r.interactions, 0);
  return pct(inter, views);
}

/**
 * % pertumbuhan followers sebulan. Per akun: awal = followers akhir minggu pertama dikurangi net follow minggu itu
 * (= followers di awal minggu pertama), akhir = followers akhir minggu terakhir. Akun tanpa awal > 0 dilewati.
 * Hasil gabungan semua akun: (Σ akhir − Σ awal) ÷ Σ awal × 100.
 */
export function followersGrowthOf(rows: readonly ReportRow[]): number | null {
  const byAccount = new Map<string, ReportRow[]>();
  for (const r of rows) byAccount.set(r.accountId, [...(byAccount.get(r.accountId) ?? []), r]);
  let start = 0;
  let end = 0;
  for (const list of byAccount.values()) {
    const sorted = [...list].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const base = first.followers - (first.follows - first.unfollows);
    if (!(base > 0)) continue;
    start += base;
    end += last.followers;
  }
  if (!(start > 0)) return null;
  return ((end - start) / start) * 100;
}

/** Pencapaian % terhadap target; target kosong/0 → null (belum bisa dinilai). */
export function achievementPct(actual: number | null | undefined, target: number | null | undefined): number | null {
  if (actual == null || !Number.isFinite(actual)) return null;
  if (target == null || !(target > 0)) return null;
  return (actual / target) * 100;
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
  /** Pencapaian % terhadap target — yang dinilai terhadap ambang. */
  score: number | null;
  status: MetricStatus;
  note?: string;
}

/** Skor + status satu metrik: target kosong → belum dinilai; data kosong → belum lengkap. */
export function scoreMetric(actual: number | null, cfg: ConfigVersion | null, code: SocialMetricCode): ScoredMetric {
  const target = cfg?.targetValue ?? null;
  const base = { code, actual: actual == null ? null : roundValue(actual), target };
  if (!cfg) return { ...base, score: null, status: "not_assessed", note: "Ambang belum diatur." };
  if (target == null || !(target > 0)) return { ...base, score: null, status: "not_assessed", note: "Target bulanan belum diisi." };
  if (actual == null) return { ...base, score: null, status: "incomplete", note: "Belum ada data bulan ini." };
  const score = achievementPct(actual, target);
  return {
    ...base,
    score: score == null ? null : roundValue(score),
    status: metricStatus(score, "higher_better", { green: cfg.greenBound, red: cfg.redBound }),
  };
}

/** "YYYY-MM-DD" yang benar-benar ada di kalender (menolak 2026-13-45, 2026-02-30, dst). */
export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
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

/** `n` bulan berakhir di `monthIso` (urut lama → baru), mis. untuk grafik tren. */
export function lastMonths(monthIso: string, n: number): string[] {
  let y = Number(monthIso.slice(0, 4));
  let m = Number(monthIso.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}-01`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}
