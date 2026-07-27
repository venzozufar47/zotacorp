import "server-only";
import type { Platform, ProviderId } from "@/lib/social/types";
import type { FailReason } from "@/lib/social/http";

/**
 * Antarmuka adapter sumber data.
 *
 * Alasan lapisan ini ada: dua API resmi yang kita pakai punya kemampuan yang
 * TIDAK setara (TikTok Display tidak punya reach/saves/watch time; Instagram
 * tidak menyimpan riwayat lebih dari 90 hari), dan sumbernya bisa berubah
 * (vendor berbayar, scraper, platform baru). Kalau bentuk API bocor ke seluruh
 * aplikasi, setiap pergantian jadi pembongkaran.
 *
 * Maka: skema database adalah produknya, API hanya plug-in. Adapter dipilih
 * per akun lewat kolom social_accounts.provider — mengganti sumber data untuk
 * satu brand adalah mengganti nilai dropdown, bukan deploy ulang arsitektur.
 */

export type { FailReason };

export type ProviderResult<T> =
  | { ok: true; data: T; apiCalls: number }
  | { ok: false; reason: FailReason; detail?: string; apiCalls: number };

/**
 * Apa yang benar-benar SANGGUP disuplai provider ini.
 *
 * Dipakai UI untuk membedakan "nol" dari "tidak tersedia", dan untuk mencegah
 * pemeringkatan lintas platform yang tidak adil — memeringkat kreator TikTok
 * berdasarkan reach akan selalu menempatkan mereka di dasar, bukan karena
 * kinerjanya buruk tapi karena angkanya tidak pernah ada.
 */
export interface ProviderCapabilities {
  accountFollowers: boolean;
  accountReach: boolean;
  accountProfileViews: boolean;
  accountDemographics: boolean;
  postViews: boolean;
  postReach: boolean;
  postSaves: boolean;
  postWatchTime: boolean;
  historicalBackfill: boolean;
  maxPostsPerCall: number;
  refreshable: boolean;
}

export interface ProviderCredentials {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  refreshExpiresAt: string | null;
  externalUserId: string | null;
}

export interface AccountContext {
  accountId: string;
  platform: Platform;
  handle: string;
  externalAccountId: string | null;
  /** social_accounts.provider_config — knob NON-rahasia. */
  config: Record<string, unknown>;
  /** Sudah didekripsi. Hanya ada di sisi server. */
  credentials: ProviderCredentials | null;
}

export interface AccountSnapshot {
  externalAccountId: string;
  handle?: string;
  displayName?: string;
  /** Semua opsional & nullable: null berarti provider tidak menyediakan,
   *  JANGAN diisi 0 — 0 adalah klaim bahwa nilainya nol. */
  followerCount?: number | null;
  followingCount?: number | null;
  mediaCount?: number | null;
  likesTotal?: number | null;
  profileViews?: number | null;
  reach?: number | null;
  impressions?: number | null;
  accountsEngaged?: number | null;
  websiteClicks?: number | null;
  capturedAt: string;
  raw: unknown;
}

export interface PostRecord {
  externalPostId: string;
  mediaType?: string | null;
  permalink?: string | null;
  thumbnailUrl?: string | null;
  caption?: string | null;
  publishedAt: string;
  durationSeconds?: number | null;
  raw: unknown;
}

export interface PostMetricSample {
  externalPostId: string;
  views?: number | null;
  plays?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
  impressions?: number | null;
  profileVisits?: number | null;
  follows?: number | null;
  watchTimeSeconds?: number | null;
  avgWatchTimeSeconds?: number | null;
  fullVideoWatchedRate?: number | null;
  capturedAt: string;
  raw: unknown;
}

export type ProviderOp = "account" | "posts" | "metrics";

export interface SocialProvider {
  readonly id: ProviderId;
  readonly platforms: readonly Platform[];
  readonly capabilities: ProviderCapabilities;
  /**
   * Berapa lama sebelum kedaluwarsa token harus disegarkan.
   * TikTok (token 24 jam) → 30 menit. Instagram (long-lived 60 hari) → 5 hari,
   * karena Meta MENOLAK menyegarkan token yang belum berumur 24 jam.
   */
  readonly refreshLeadMs: number;

  /**
   * Perkiraan jumlah panggilan SEBELUM kuota dibelanjakan. Instagram tidak
   * punya endpoint insights massal, jadi n postingan = n panggilan — inilah
   * yang membuat cek budget 200/jam benar-benar menggigit alih-alih jadi
   * hiasan.
   */
  estimateCalls(op: ProviderOp, n: number): number;

  fetchAccount(ctx: AccountContext): Promise<ProviderResult<AccountSnapshot>>;

  listPosts(
    ctx: AccountContext,
    opts: { since?: string; cursor?: string | null; limit: number }
  ): Promise<ProviderResult<{ posts: PostRecord[]; nextCursor: string | null }>>;

  fetchPostMetrics(
    ctx: AccountContext,
    externalPostIds: string[]
  ): Promise<ProviderResult<PostMetricSample[]>>;

  /** Absen = tidak ada token yang bisa disegarkan (manual, scraper, atau
   *  vendor yang mengurus tokennya sendiri). */
  refreshCredentials?(
    ctx: AccountContext
  ): Promise<ProviderResult<ProviderCredentials>>;
}

/** Kapabilitas kosong — dasar yang aman untuk provider baru: semuanya harus
 *  dinyalakan secara sadar, jadi lupa mengisi berarti "tidak tersedia",
 *  bukan diam-diam mengklaim bisa. */
export const NO_CAPABILITIES: ProviderCapabilities = {
  accountFollowers: false,
  accountReach: false,
  accountProfileViews: false,
  accountDemographics: false,
  postViews: false,
  postReach: false,
  postSaves: false,
  postWatchTime: false,
  historicalBackfill: false,
  maxPostsPerCall: 0,
  refreshable: false,
};

export function fail<T>(
  reason: FailReason,
  detail?: string,
  apiCalls = 0
): ProviderResult<T> {
  return { ok: false, reason, detail, apiCalls };
}
