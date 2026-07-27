/**
 * Tipe domain fitur Social Insights.
 *
 * Dipisah dari actions (yang "use server", sehingga seluruh export-nya wajib
 * async) supaya komponen klien bisa mengimpor tipe tanpa menyeret kode server —
 * pola yang sama dipakai src/lib/sim-cards/types.ts.
 *
 * Tabel social_* belum ada di src/lib/supabase/types.ts (berkas itu digenerate),
 * jadi query memakai `.from("social_accounts" as never)` dan bentuk barisnya
 * dijaga manual di sini.
 */

export type Platform = "instagram" | "tiktok" | "youtube" | "facebook";

export type ProviderId =
  | "manual"
  | "instagram_graph"
  | "tiktok_display"
  | "ayrshare"
  | "phyllo"
  | "scrape_generic";

export type TokenStatus = "ok" | "expiring" | "reauth_required" | "none";

export type SyncStatus = "running" | "ok" | "partial" | "error" | "skipped";

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  manual: "Manual (belum tersambung)",
  instagram_graph: "Instagram Graph API",
  tiktok_display: "TikTok Display API",
  ayrshare: "Ayrshare",
  phyllo: "Phyllo",
  scrape_generic: "Scraper",
};

export interface SocialAccount {
  id: string;
  businessUnitId: string;
  businessUnitName: string;
  platform: Platform;
  handle: string;
  displayName: string | null;
  externalAccountId: string | null;
  provider: ProviderId;
  providerConfig: Record<string, unknown>;
  defaultCreatorId: string | null;
  defaultCreatorName: string | null;
  managerId: string | null;
  managerName: string | null;
  syncEnabled: boolean;
  isActive: boolean;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  tokenExpiresAt: string | null;
  tokenStatus: TokenStatus;
  tokenRefreshFailures: number;
  followerCount: number | null;
  /** Apakah baris kredensial ada — TANPA membawa isinya. UI hanya perlu tahu
   *  "sudah tersambung atau belum", bukan tokennya. */
  hasCredentials: boolean;
}

export interface SocialSyncRun {
  id: string;
  kind: string;
  accountId: string | null;
  accountLabel: string | null;
  provider: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: SyncStatus;
  apiCalls: number;
  postsSeen: number;
  postsUpserted: number;
  metricRows: number;
  errorReason: string | null;
  errorDetail: string | null;
}

export interface SocialKpiTarget {
  id: string;
  scope: "creator" | "account" | "business_unit";
  creatorId: string | null;
  creatorName: string | null;
  accountId: string | null;
  accountLabel: string | null;
  businessUnitId: string | null;
  businessUnitName: string | null;
  metricKey: string;
  periodType: "monthly" | "weekly" | "custom";
  periodStart: string;
  periodEnd: string | null;
  targetValue: number;
  comparator: "gte" | "lte";
  weight: number;
  notes: string | null;
  isActive: boolean;
}

/** Pilihan dropdown untuk form akun — dikirim dari server agar klien tidak
 *  perlu query sendiri. */
export interface SocialFormOptions {
  businessUnits: { id: string; name: string }[];
  employees: { id: string; name: string; jobRole: string | null }[];
}

/** Ringkasan kesehatan untuk strip di atas halaman. */
export interface SocialHealth {
  accountsTotal: number;
  accountsConnected: number;
  accountsNeedingReauth: number;
  lastRunAt: string | null;
  lastRunStatus: SyncStatus | null;
}
