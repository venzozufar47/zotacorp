/**
 * Agregasi angka Social Insights.
 *
 * Murni tanpa I/O: menerima baris, mengembalikan bentuk siap tampil. Actions
 * hanya mengambil data lalu memanggil modul ini — persis pemisahan yang
 * dipakai src/lib/costing/rows.ts dan src/lib/cashflow/pnl.ts. Efeknya angka
 * KPI bisa diperiksa tanpa database, dan itu penting karena angka inilah yang
 * dipakai menilai orang.
 *
 * Aturan yang dipegang di seluruh berkas: null berarti "tidak tersedia dari
 * provider", dan TIDAK BOLEH diperlakukan sebagai nol. Menjumlahkan null
 * sebagai 0 akan membuat kreator TikTok terlihat berkinerja nol pada metrik
 * yang memang tidak pernah disediakan API-nya.
 */

import { valueAtAge } from "@/lib/social/schedule";
import type { DateRange } from "@/lib/utils/date-range";

export interface PostRow {
  id: string;
  account_id: string;
  platform: string;
  published_at: string;
  published_date: string;
  creator_id: string | null;
  media_type: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  impressions: number | null;
  engagement_rate: number | null;
}

export interface MetricSampleRow {
  post_id: string;
  age_minutes: number;
  captured_at: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
}

export interface AccountMetricRow {
  account_id: string;
  captured_date: string;
  follower_count: number | null;
  profile_views: number | null;
  reach: number | null;
}

/** Penjumlahan yang menghormati "tidak tersedia": hasilnya null kalau TIDAK
 *  ADA satu pun nilai, bukan 0. Membedakan "belum ada data" dari "nol". */
export function sumOrNull(values: readonly (number | null | undefined)[]): number | null {
  let total = 0;
  let seen = false;
  for (const v of values) {
    if (v == null) continue;
    total += v;
    seen = true;
  }
  return seen ? total : null;
}

export function avgOrNull(values: readonly (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Median — lebih jujur dari rata-rata untuk views, karena satu konten viral
 *  bisa menyeret rata-rata dan menyembunyikan konsistensi yang buruk. */
export function medianOrNull(values: readonly (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * Engagement rate sebuah postingan.
 *
 * Penyebutnya reach kalau ada (paling bermakna: dari yang MELIHAT, berapa yang
 * bereaksi), kalau tidak views. Mengembalikan null saat keduanya tidak ada —
 * jangan dipaksa 0, karena 0% adalah pernyataan bahwa tidak seorang pun
 * bereaksi, sedangkan yang sebenarnya terjadi adalah kita tidak tahu.
 */
export function engagementRate(p: {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  views: number | null;
}): number | null {
  const base = p.reach ?? p.views;
  if (!base || base <= 0) return null;
  const inter = sumOrNull([p.likes, p.comments, p.shares, p.saves]);
  if (inter == null) return null;
  return inter / base;
}

export interface OverviewTotals {
  posts: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  /** Rata-rata ER per postingan — bukan ER dari total, supaya satu konten
   *  viral tidak mendominasi angka kualitas. */
  engagementRate: number | null;
  followerStart: number | null;
  followerEnd: number | null;
  followerGrowth: number | null;
}

export function computeOverview(
  posts: readonly PostRow[],
  accountMetrics: readonly AccountMetricRow[]
): OverviewTotals {
  const ers = posts.map((p) => p.engagement_rate ?? engagementRate(p));

  // Pertumbuhan follower dijumlahkan LINTAS AKUN pada titik awal & akhir
  // masing-masing, bukan selisih global — akun yang datanya belum lengkap
  // tidak boleh tampak sebagai lonjakan/anjlok.
  const byAccount = new Map<string, AccountMetricRow[]>();
  for (const m of accountMetrics) {
    const arr = byAccount.get(m.account_id) ?? [];
    arr.push(m);
    byAccount.set(m.account_id, arr);
  }
  let start: number | null = null;
  let end: number | null = null;
  for (const rows of byAccount.values()) {
    const sorted = rows
      .filter((r) => r.follower_count != null)
      .sort((a, b) => a.captured_date.localeCompare(b.captured_date));
    if (sorted.length === 0) continue;
    start = (start ?? 0) + (sorted[0].follower_count ?? 0);
    end = (end ?? 0) + (sorted[sorted.length - 1].follower_count ?? 0);
  }

  return {
    posts: posts.length,
    views: sumOrNull(posts.map((p) => p.views)),
    likes: sumOrNull(posts.map((p) => p.likes)),
    comments: sumOrNull(posts.map((p) => p.comments)),
    shares: sumOrNull(posts.map((p) => p.shares)),
    saves: sumOrNull(posts.map((p) => p.saves)),
    reach: sumOrNull(posts.map((p) => p.reach)),
    engagementRate: avgOrNull(ers),
    followerStart: start,
    followerEnd: end,
    followerGrowth: start != null && end != null ? end - start : null,
  };
}

export interface CreatorStats {
  creatorId: string | null;
  posts: number;
  views: number | null;
  viewsMedian: number | null;
  /** Rata-rata views pada 24 jam pertama — pembanding paling adil antar
   *  kreator karena menetralkan umur konten. */
  views24hAvg: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  engagementRate: number | null;
  bestPostId: string | null;
  bestPostViews: number | null;
  /** Berapa postingan yang benar-benar punya tangkapan 24 jam. Ditampilkan
   *  supaya rata-rata dari 1 postingan tidak dibaca setara dengan dari 20. */
  views24hSample: number;
}

export function computeCreatorStats(
  posts: readonly PostRow[],
  samplesByPost: ReadonlyMap<string, MetricSampleRow[]>
): CreatorStats[] {
  const groups = new Map<string, PostRow[]>();
  for (const p of posts) {
    const key = p.creator_id ?? "__unassigned__";
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }

  const out: CreatorStats[] = [];
  for (const [key, list] of groups) {
    const v24: number[] = [];
    for (const p of list) {
      const s = samplesByPost.get(p.id);
      if (!s?.length) continue;
      const val = valueAtAge(s, 1440, (x) => x.views);
      if (val != null) v24.push(val);
    }
    const best = list.reduce<PostRow | null>(
      (acc, p) => ((p.views ?? -1) > (acc?.views ?? -1) ? p : acc),
      null
    );
    out.push({
      creatorId: key === "__unassigned__" ? null : key,
      posts: list.length,
      views: sumOrNull(list.map((p) => p.views)),
      viewsMedian: medianOrNull(list.map((p) => p.views)),
      views24hAvg: v24.length ? v24.reduce((a, b) => a + b, 0) / v24.length : null,
      views24hSample: v24.length,
      likes: sumOrNull(list.map((p) => p.likes)),
      comments: sumOrNull(list.map((p) => p.comments)),
      shares: sumOrNull(list.map((p) => p.shares)),
      saves: sumOrNull(list.map((p) => p.saves)),
      reach: sumOrNull(list.map((p) => p.reach)),
      engagementRate: avgOrNull(
        list.map((p) => p.engagement_rate ?? engagementRate(p))
      ),
      bestPostId: best?.id ?? null,
      bestPostViews: best?.views ?? null,
    });
  }
  return out.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
}

export interface DailyPoint {
  date: string;
  posts: number;
  views: number | null;
  engagementRate: number | null;
  followers: number | null;
}

/** Deret harian untuk grafik. Hari tanpa postingan tetap muncul (posts 0,
 *  views null) supaya sumbu waktu tidak bohong soal jeda. */
export function computeDailySeries(
  dates: readonly string[],
  posts: readonly PostRow[],
  accountMetrics: readonly AccountMetricRow[]
): DailyPoint[] {
  const postsByDate = new Map<string, PostRow[]>();
  for (const p of posts) {
    const arr = postsByDate.get(p.published_date) ?? [];
    arr.push(p);
    postsByDate.set(p.published_date, arr);
  }
  const followersByDate = new Map<string, number[]>();
  for (const m of accountMetrics) {
    if (m.follower_count == null) continue;
    const arr = followersByDate.get(m.captured_date) ?? [];
    arr.push(m.follower_count);
    followersByDate.set(m.captured_date, arr);
  }

  return dates.map((date) => {
    const dayPosts = postsByDate.get(date) ?? [];
    const f = followersByDate.get(date);
    return {
      date,
      posts: dayPosts.length,
      views: sumOrNull(dayPosts.map((p) => p.views)),
      engagementRate: avgOrNull(
        dayPosts.map((p) => p.engagement_rate ?? engagementRate(p))
      ),
      // Dijumlahkan lintas akun: ini "total follower yang dipantau", bukan
      // follower satu akun.
      followers: f?.length ? f.reduce((a, b) => a + b, 0) : null,
    };
  });
}

/** Views pada beberapa umur untuk satu postingan — kolom @24j/@48j/@7h. */
export function postAgeMilestones(
  samples: readonly MetricSampleRow[]
): { v24: number | null; v48: number | null; v7d: number | null } {
  return {
    v24: valueAtAge(samples, 1440, (s) => s.views),
    v48: valueAtAge(samples, 2880, (s) => s.views),
    v7d: valueAtAge(samples, 10080, (s) => s.views),
  };
}

/** Deret views mentah untuk sparkline per baris, urut waktu. */
export function viewsTrajectory(samples: readonly MetricSampleRow[]): number[] {
  return samples
    .filter((s) => s.views != null)
    .sort((a, b) => a.age_minutes - b.age_minutes)
    .map((s) => s.views as number);
}

export interface RangeSummary {
  range: DateRange;
  totals: OverviewTotals;
  daily: DailyPoint[];
  creators: CreatorStats[];
}
