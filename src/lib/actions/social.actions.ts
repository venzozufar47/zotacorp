"use server";

/**
 * Server actions Social Insights — registri akun, kredensial, target KPI.
 *
 * Gate pola `_gates.ts` (requireSocialAdmin). Query pakai
 * `.from("social_accounts" as never)` karena tabel social_* belum ada di
 * `src/lib/supabase/types.ts` yang digenerate; bentuk barisnya dijaga manual
 * di `src/lib/social/types.ts`.
 *
 * Aturan kunci: TIDAK ADA action di berkas ini yang mengembalikan materi token.
 * Status koneksi untuk UI dibaca dari kolom cermin di social_accounts
 * (token_status / token_expires_at), bukan dari social_account_credentials —
 * tabel itu punya RLS aktif tanpa policy dan hanya boleh disentuh service-role.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "./_supabase-admin";
import { requireSocialAdmin } from "./_gates";
import { encryptToken, currentEncVersion } from "@/lib/social/crypto";
import { isValidMetricKey } from "@/lib/social/metrics";
import {
  computeCreatorStats,
  computeDailySeries,
  computeOverview,
  postAgeMilestones,
  viewsTrajectory,
  type AccountMetricRow,
  type CreatorStats,
  type DailyPoint,
  type MetricSampleRow,
  type OverviewTotals,
  type PostRow,
} from "@/lib/social/analytics";
import { engagementRate } from "@/lib/social/analytics";
import { parsePastedPosts, manualPostId } from "@/lib/social/import";
import { eachDate } from "@/lib/utils/date-range";
import { jakartaDateString } from "@/lib/utils/jakarta";
import type {
  SocialAccount,
  SocialFormOptions,
  SocialHealth,
  SocialKpiTarget,
  SocialSyncRun,
  TokenStatus,
} from "@/lib/social/types";

type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidateSocial() {
  try {
    revalidatePath("/admin/social");
    revalidatePath("/admin/social/akun");
  } catch {
    /* revalidate di luar konteks request — abaikan */
  }
}

const ACCOUNT_COLS =
  "id, business_unit_id, platform, handle, display_name, external_account_id, provider, provider_config, default_creator_id, manager_id, sync_enabled, is_active, last_synced_at, last_sync_status, last_sync_error, token_expires_at, token_status, token_refresh_failures, follower_count_cache";

/** Turunkan status token dari kolom cermin. Dipisah supaya UI dan cron memakai
 *  definisi yang sama persis. */
function deriveTokenStatus(
  stored: string | null,
  expiresAt: string | null,
  hasCreds: boolean
): TokenStatus {
  if (stored === "reauth_required") return "reauth_required";
  if (!hasCreds) return "none";
  if (!expiresAt) return "ok";
  const ms = Date.parse(expiresAt) - Date.now();
  if (ms <= 0) return "reauth_required";
  if (ms < 24 * 3600 * 1000) return "expiring";
  return "ok";
}

/**
 * Lengkapi baris akun dengan nama unit bisnis & profil, lalu tandai akun mana
 * yang sudah punya kredensial — dengan query `select account_id` saja, tanpa
 * pernah menyentuh kolom tokennya.
 */
async function hydrateAccounts(
  db: ReturnType<typeof createAdminClient>,
  rows: any[]
): Promise<SocialAccount[]> {
  if (rows.length === 0) return [];
  const buIds = [...new Set(rows.map((r) => r.business_unit_id))];
  const userIds = [
    ...new Set(
      rows.flatMap((r) => [r.default_creator_id, r.manager_id]).filter(Boolean)
    ),
  ];
  const accIds = rows.map((r) => r.id);

  const [bus, profs, creds] = await Promise.all([
    db.from("business_units").select("id, name").in("id", buIds),
    userIds.length
      ? db.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    db
      .from("social_account_credentials" as never)
      .select("account_id")
      .in("account_id", accIds),
  ]);

  const buName = new Map((bus.data ?? []).map((b: any) => [b.id, b.name]));
  const pName = new Map((profs.data ?? []).map((p: any) => [p.id, p.full_name]));
  const hasCred = new Set((creds.data ?? []).map((c: any) => c.account_id));

  return rows.map((r) => ({
    id: r.id,
    businessUnitId: r.business_unit_id,
    businessUnitName: buName.get(r.business_unit_id) ?? "—",
    platform: r.platform,
    handle: r.handle,
    displayName: r.display_name,
    externalAccountId: r.external_account_id,
    provider: r.provider,
    providerConfig: r.provider_config ?? {},
    defaultCreatorId: r.default_creator_id,
    defaultCreatorName: r.default_creator_id
      ? pName.get(r.default_creator_id) ?? "—"
      : null,
    managerId: r.manager_id,
    managerName: r.manager_id ? pName.get(r.manager_id) ?? "—" : null,
    syncEnabled: r.sync_enabled,
    isActive: r.is_active,
    lastSyncedAt: r.last_synced_at,
    lastSyncStatus: r.last_sync_status,
    lastSyncError: r.last_sync_error,
    tokenExpiresAt: r.token_expires_at,
    tokenStatus: deriveTokenStatus(
      r.token_status,
      r.token_expires_at,
      hasCred.has(r.id)
    ),
    tokenRefreshFailures: r.token_refresh_failures ?? 0,
    followerCount: r.follower_count_cache,
    hasCredentials: hasCred.has(r.id),
  }));
}

// ─── Read ──────────────────────────────────────────────────────────────────

export async function listSocialAccounts(opts?: {
  includeArchived?: boolean;
}): Promise<SocialAccount[]> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return [];
  const db = createAdminClient();
  let q = db
    .from("social_accounts" as never)
    .select(ACCOUNT_COLS)
    .order("platform", { ascending: true })
    .order("handle", { ascending: true });
  if (!opts?.includeArchived) q = q.eq("is_active", true);
  const { data } = await q;
  return hydrateAccounts(db, (data ?? []) as any[]);
}

export async function getSocialFormOptions(): Promise<SocialFormOptions> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return { businessUnits: [], employees: [] };
  const db = createAdminClient();
  const [bus, profs] = await Promise.all([
    db.from("business_units").select("id, name").order("name"),
    db
      .from("profiles")
      .select("id, full_name, job_role")
      .eq("is_active", true)
      .is("resigned_at", null)
      .neq("role", "investor")
      .order("full_name"),
  ]);
  return {
    businessUnits: (bus.data ?? []).map((b: any) => ({ id: b.id, name: b.name })),
    employees: (profs.data ?? []).map((p: any) => ({
      id: p.id,
      name: p.full_name,
      jobRole: p.job_role,
    })),
  };
}

export async function listSyncRuns(limit = 30): Promise<SocialSyncRun[]> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return [];
  const db = createAdminClient();
  const { data } = await db
    .from("social_sync_runs" as never)
    .select(
      "id, kind, account_id, provider, started_at, finished_at, status, api_calls, posts_seen, posts_upserted, metric_rows, error_reason, error_detail"
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as any[];
  const accIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean))];
  const labels = new Map<string, string>();
  if (accIds.length) {
    const { data: accs } = await db
      .from("social_accounts" as never)
      .select("id, platform, handle")
      .in("id", accIds);
    for (const a of (accs ?? []) as any[]) {
      labels.set(a.id, `${a.platform}/@${a.handle}`);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    accountId: r.account_id,
    accountLabel: r.account_id ? labels.get(r.account_id) ?? null : null,
    provider: r.provider,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    apiCalls: r.api_calls ?? 0,
    postsSeen: r.posts_seen ?? 0,
    postsUpserted: r.posts_upserted ?? 0,
    metricRows: r.metric_rows ?? 0,
    errorReason: r.error_reason,
    errorDetail: r.error_detail,
  }));
}

export async function getSocialHealth(): Promise<SocialHealth> {
  const accounts = await listSocialAccounts();
  const runs = await listSyncRuns(1);
  return {
    accountsTotal: accounts.length,
    accountsConnected: accounts.filter((a) => a.hasCredentials).length,
    accountsNeedingReauth: accounts.filter(
      (a) => a.tokenStatus === "reauth_required"
    ).length,
    lastRunAt: runs[0]?.startedAt ?? null,
    lastRunStatus: runs[0]?.status ?? null,
  };
}

// ─── Write ─────────────────────────────────────────────────────────────────

const accountSchema = z.object({
  businessUnitId: z.string().uuid(),
  platform: z.enum(["instagram", "tiktok", "youtube", "facebook"]),
  handle: z
    .string()
    .trim()
    .min(1, "Handle wajib diisi")
    .max(60)
    // Simpan tanpa "@" supaya unique index tidak menganggap @x dan x berbeda.
    .transform((v) => v.replace(/^@+/, "")),
  displayName: z.string().trim().max(120).optional().nullable(),
  provider: z.enum([
    "manual",
    "instagram_graph",
    "tiktok_display",
    "ayrshare",
    "phyllo",
    "scrape_generic",
  ]),
  defaultCreatorId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  syncEnabled: z.boolean().optional(),
});

export async function createSocialAccount(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }
  const v = parsed.data;
  const db = createAdminClient();
  const { data, error } = await db
    .from("social_accounts" as never)
    .insert({
      business_unit_id: v.businessUnitId,
      platform: v.platform,
      handle: v.handle,
      display_name: v.displayName || null,
      provider: v.provider,
      default_creator_id: v.defaultCreatorId || null,
      manager_id: v.managerId || null,
      sync_enabled: v.syncEnabled ?? true,
      created_by: gate.userId,
    } as never)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `@${v.handle} sudah terdaftar di ${v.platform}.` };
    }
    return { ok: false, error: error.message };
  }
  revalidateSocial();
  return { ok: true, data: { id: (data as any).id } };
}

export async function updateSocialAccount(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = accountSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }
  const v = parsed.data;
  const patch: Record<string, unknown> = {};
  if (v.businessUnitId !== undefined) patch.business_unit_id = v.businessUnitId;
  if (v.platform !== undefined) patch.platform = v.platform;
  if (v.handle !== undefined) patch.handle = v.handle;
  if (v.displayName !== undefined) patch.display_name = v.displayName || null;
  if (v.provider !== undefined) patch.provider = v.provider;
  if (v.defaultCreatorId !== undefined)
    patch.default_creator_id = v.defaultCreatorId || null;
  if (v.managerId !== undefined) patch.manager_id = v.managerId || null;
  if (v.syncEnabled !== undefined) patch.sync_enabled = v.syncEnabled;
  if (Object.keys(patch).length === 0) return { ok: true };

  const db = createAdminClient();
  const { error } = await db
    .from("social_accounts" as never)
    .update(patch as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateSocial();
  return { ok: true };
}

export async function setSocialAccountArchived(
  id: string,
  archived: boolean
): Promise<ActionResult> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = createAdminClient();
  const { error } = await db
    .from("social_accounts" as never)
    .update({ is_active: !archived } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateSocial();
  return { ok: true };
}

/**
 * Simpan token hasil OAuth / tempel manual.
 *
 * Hanya menulis — tidak pernah mengembalikan isinya. Sekaligus mencerminkan
 * status ke social_accounts supaya UI tidak punya alasan apa pun untuk
 * menyentuh tabel kredensial.
 */
export async function setSocialAccountCredentials(input: {
  accountId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  externalUserId?: string | null;
}): Promise<ActionResult> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!input.accessToken?.trim()) {
    return { ok: false, error: "Access token kosong." };
  }
  const db = createAdminClient();
  const encV = currentEncVersion();
  const { error } = await db
    .from("social_account_credentials" as never)
    .upsert(
      {
        account_id: input.accountId,
        access_token: encryptToken(input.accessToken),
        refresh_token: encryptToken(input.refreshToken ?? null),
        expires_at: input.expiresAt ?? null,
        external_user_id: input.externalUserId ?? null,
        enc_version: encV,
        last_refreshed_at: new Date().toISOString(),
        refresh_failure_count: 0,
        last_refresh_error: null,
      } as never,
      { onConflict: "account_id" }
    );
  if (error) return { ok: false, error: error.message };

  await db
    .from("social_accounts" as never)
    .update({
      token_expires_at: input.expiresAt ?? null,
      token_status: "ok",
      token_refresh_failures: 0,
    } as never)
    .eq("id", input.accountId);

  revalidateSocial();
  return { ok: true };
}

export async function clearSocialAccountCredentials(
  accountId: string
): Promise<ActionResult> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = createAdminClient();
  await db
    .from("social_account_credentials" as never)
    .delete()
    .eq("account_id", accountId);
  await db
    .from("social_accounts" as never)
    .update({
      token_expires_at: null,
      token_status: null,
      token_refresh_failures: 0,
    } as never)
    .eq("id", accountId);
  revalidateSocial();
  return { ok: true };
}

// ─── Dashboard insight ─────────────────────────────────────────────────────

export interface SocialDashboardFilters {
  from: string;
  to: string;
  businessUnitId?: string | null;
  platform?: string | null;
  accountId?: string | null;
  creatorId?: string | null;
}

export interface DashboardPost extends PostRow {
  accountHandle: string;
  creatorName: string | null;
  v24: number | null;
  v48: number | null;
  v7d: number | null;
  trajectory: number[];
}

export interface SocialDashboard {
  totals: OverviewTotals;
  daily: DailyPoint[];
  creators: (CreatorStats & { creatorName: string })[];
  posts: DashboardPost[];
  /** Platform yang ikut terpilih — dipakai UI memasang peringatan saat metrik
   *  yang dipakai memeringkat tidak tersedia di salah satunya. */
  platformsInView: string[];
  accountsInView: number;
}

/**
 * Semua angka yang dibutuhkan empat tab, dalam satu perjalanan.
 *
 * Volume-nya kecil secara struktural (4 akun x ~30 postingan/bulan), jadi
 * mengambil seluruh postingan dalam rentang lalu mengagregasi di memori jauh
 * lebih sederhana — dan lebih mudah diperiksa — daripada menyebar SUM ke
 * beberapa query SQL yang harus dijaga tetap konsisten satu sama lain.
 */
export async function getSocialDashboard(
  filters: SocialDashboardFilters
): Promise<SocialDashboard | { error: string }> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return { error: gate.error };
  const db = createAdminClient();

  // Akun dulu: filter unit bisnis/platform diterapkan di sini sekali, lalu
  // postingan cukup disaring by account_id.
  let accQ = db
    .from("social_accounts" as never)
    .select("id, handle, platform, business_unit_id")
    .eq("is_active", true);
  if (filters.businessUnitId) accQ = accQ.eq("business_unit_id", filters.businessUnitId);
  if (filters.platform) accQ = accQ.eq("platform", filters.platform);
  if (filters.accountId) accQ = accQ.eq("id", filters.accountId);
  const { data: accRows } = await accQ;
  const accounts = (accRows ?? []) as any[];
  const accountIds = accounts.map((a) => a.id);

  const empty: SocialDashboard = {
    totals: computeOverview([], []),
    daily: computeDailySeries(eachDate({ from: filters.from, to: filters.to }), [], []),
    creators: [],
    posts: [],
    platformsInView: [],
    accountsInView: 0,
  };
  if (accountIds.length === 0) return empty;

  let postQ = db
    .from("social_posts" as never)
    .select(
      "id, account_id, platform, published_at, published_date, creator_id, media_type, permalink, thumbnail_url, caption, views, likes, comments, shares, saves, reach, impressions, engagement_rate"
    )
    .in("account_id", accountIds)
    .gte("published_date", filters.from)
    .lte("published_date", filters.to)
    .eq("is_deleted", false)
    .order("published_at", { ascending: false });
  if (filters.creatorId) postQ = postQ.eq("creator_id", filters.creatorId);

  const [{ data: postRows }, { data: metricRows }] = await Promise.all([
    postQ,
    db
      .from("social_account_metrics" as never)
      .select("account_id, captured_date, follower_count, profile_views, reach")
      .in("account_id", accountIds)
      .gte("captured_date", filters.from)
      .lte("captured_date", filters.to),
  ]);

  const posts = (postRows ?? []) as PostRow[];
  const accountMetrics = (metricRows ?? []) as AccountMetricRow[];

  // Deret waktu hanya untuk postingan yang tampil.
  const samplesByPost = new Map<string, MetricSampleRow[]>();
  if (posts.length) {
    const { data: samples } = await db
      .from("social_post_metrics" as never)
      .select("post_id, age_minutes, captured_at, views, likes, comments, shares, saves, reach")
      .in(
        "post_id",
        posts.map((p) => p.id)
      );
    for (const s of ((samples ?? []) as MetricSampleRow[])) {
      const arr = samplesByPost.get(s.post_id) ?? [];
      arr.push(s);
      samplesByPost.set(s.post_id, arr);
    }
  }

  const creatorStats = computeCreatorStats(posts, samplesByPost);
  const creatorIds = creatorStats
    .map((c) => c.creatorId)
    .filter((v): v is string => !!v);
  const nameById = new Map<string, string>();
  if (creatorIds.length) {
    const { data: profs } = await db
      .from("profiles")
      .select("id, full_name")
      .in("id", creatorIds);
    for (const p of (profs ?? []) as any[]) nameById.set(p.id, p.full_name);
  }

  const handleById = new Map(accounts.map((a) => [a.id, a.handle as string]));

  return {
    totals: computeOverview(posts, accountMetrics),
    daily: computeDailySeries(
      eachDate({ from: filters.from, to: filters.to }),
      posts,
      accountMetrics
    ),
    creators: creatorStats.map((c) => ({
      ...c,
      creatorName: c.creatorId
        ? nameById.get(c.creatorId) ?? "—"
        : "Belum ditetapkan",
    })),
    posts: posts.map((p) => {
      const s = samplesByPost.get(p.id) ?? [];
      const ms = postAgeMilestones(s);
      return {
        ...p,
        accountHandle: handleById.get(p.account_id) ?? "—",
        creatorName: p.creator_id ? nameById.get(p.creator_id) ?? "—" : null,
        v24: ms.v24,
        v48: ms.v48,
        v7d: ms.v7d,
        trajectory: viewsTrajectory(s),
      };
    }),
    platformsInView: [...new Set(accounts.map((a) => a.platform as string))],
    accountsInView: accounts.length,
  };
}

// ─── Input manual ──────────────────────────────────────────────────────────

export interface ManualImportSummary {
  parsed: number;
  inserted: number;
  updated: number;
  metricRows: number;
  errors: { line: number; message: string }[];
}

/**
 * Tempel data konten dari spreadsheet / Insights bawaan platform.
 *
 * Ada karena app review Meta & TikTok makan berminggu-minggu, dan tanpa jalur
 * ini dashboard KPI berdiri kosong selama itu. Baris manual memakai
 * source='manual' sehingga saat API resmi aktif keduanya hidup berdampingan
 * tanpa saling menimpa.
 *
 * Upsert DUA FASE, sama seperti yang nanti dipakai mesin sync: baris baru
 * mendapat creator_id dari kreator default akun, baris lama TIDAK disentuh
 * kolom atribusinya. Kalau tidak begitu, mengganti kreator default akan
 * menulis ulang atribusi kuartal lalu setiap kali orang menempel data.
 */
export async function importManualPosts(input: {
  accountId: string;
  text: string;
}): Promise<ManualImportSummary | { error: string }> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return { error: gate.error };

  const { rows, errors } = parsePastedPosts(input.text);
  if (rows.length === 0) {
    return { parsed: 0, inserted: 0, updated: 0, metricRows: 0, errors };
  }

  const db = createAdminClient();
  const { data: acc } = await db
    .from("social_accounts" as never)
    .select("id, platform, default_creator_id")
    .eq("id", input.accountId)
    .maybeSingle();
  if (!acc) return { error: "Akun tidak ditemukan." };
  const account = acc as any;

  const now = new Date();
  const capturedDate = jakartaDateString(now);
  const prepared = rows.map((r) => {
    const time = r.publishedTime ?? "12:00";
    // Jam default 12:00 WIB, bukan 00:00: kalau jamnya tidak diketahui,
    // tengah hari tidak akan menggeser tanggal WIB ke hari sebelumnya.
    const publishedAt = `${r.publishedDate}T${time}:00+07:00`;
    return {
      row: r,
      externalId: manualPostId(r),
      publishedAt,
      ageMinutes: Math.max(
        0,
        Math.floor((now.getTime() - Date.parse(publishedAt)) / 60_000)
      ),
    };
  });

  // Fase 1: mana yang sudah ada.
  const { data: existingRows } = await db
    .from("social_posts" as never)
    .select("id, external_post_id")
    .eq("account_id", input.accountId)
    .in(
      "external_post_id",
      prepared.map((p) => p.externalId)
    );
  const existingIdByExternal = new Map(
    ((existingRows ?? []) as any[]).map((r) => [r.external_post_id, r.id])
  );

  const metricsOf = (r: (typeof prepared)[number]["row"]) => ({
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    saves: r.saves,
    reach: r.reach,
  });

  let inserted = 0;
  let updated = 0;

  // Fase 2: sisipkan yang baru — HANYA di sini creator_id ditetapkan.
  const fresh = prepared.filter((p) => !existingIdByExternal.has(p.externalId));
  if (fresh.length) {
    const { data, error } = await db
      .from("social_posts" as never)
      .insert(
        fresh.map((p) => ({
          account_id: input.accountId,
          external_post_id: p.externalId,
          platform: account.platform,
          media_type: p.row.mediaType,
          permalink: p.row.permalink,
          caption: p.row.caption,
          published_at: p.publishedAt,
          creator_id: account.default_creator_id,
          creator_source: "account_default",
          ...metricsOf(p.row),
          engagement_rate: engagementRate({ ...metricsOf(p.row) }),
          metrics_updated_at: now.toISOString(),
          raw: { source: "manual" },
        })) as never
      )
      .select("id, external_post_id");
    if (error) return { error: error.message };
    for (const r of (data ?? []) as any[]) {
      existingIdByExternal.set(r.external_post_id, r.id);
      inserted++;
    }
  }

  // Fase 3: perbarui yang lama — TANPA menyentuh creator_id/creator_source.
  for (const p of prepared.filter((x) => existingIdByExternal.has(x.externalId))) {
    if (fresh.some((f) => f.externalId === p.externalId)) continue;
    const { error } = await db
      .from("social_posts" as never)
      .update({
        media_type: p.row.mediaType,
        permalink: p.row.permalink,
        caption: p.row.caption,
        published_at: p.publishedAt,
        ...metricsOf(p.row),
        engagement_rate: engagementRate({ ...metricsOf(p.row) }),
        metrics_updated_at: now.toISOString(),
      } as never)
      .eq("id", existingIdByExternal.get(p.externalId)!);
    if (!error) updated++;
  }

  // Satu titik deret waktu per hari penempelan. Slot 'manual:<tanggal>'
  // membuat menempel dua kali di hari yang sama memperbarui, bukan
  // menggandakan — dan tetap membentuk deret kalau ditempel tiap minggu.
  const metricRows = prepared
    .map((p) => {
      const postId = existingIdByExternal.get(p.externalId);
      if (!postId) return null;
      return {
        post_id: postId,
        captured_at: now.toISOString(),
        age_minutes: p.ageMinutes,
        slot: `manual:${capturedDate}`,
        ...metricsOf(p.row),
        source: "manual",
        raw: {},
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  let metricCount = 0;
  for (let i = 0; i < metricRows.length; i += 500) {
    const chunk = metricRows.slice(i, i + 500);
    const { error } = await db
      .from("social_post_metrics" as never)
      .upsert(chunk as never, { onConflict: "post_id,slot" });
    if (!error) metricCount += chunk.length;
  }

  revalidateSocial();
  return { parsed: rows.length, inserted, updated, metricRows: metricCount, errors };
}

/**
 * Catat jumlah follower pada suatu tanggal.
 *
 * Terpisah dari konten karena inilah satu-satunya sumber grafik pertumbuhan
 * follower, dan angkanya cuma satu per hari — memaksanya lewat importer
 * konten hanya akan menyulitkan.
 */
export async function saveManualAccountSnapshot(input: {
  accountId: string;
  capturedDate: string;
  followerCount?: number | null;
  profileViews?: number | null;
  reach?: number | null;
}): Promise<ActionResult> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.capturedDate)) {
    return { ok: false, error: "Tanggal tidak valid." };
  }
  const db = createAdminClient();
  const { error } = await db.from("social_account_metrics" as never).upsert(
    {
      account_id: input.accountId,
      captured_date: input.capturedDate,
      follower_count: input.followerCount ?? null,
      profile_views: input.profileViews ?? null,
      reach: input.reach ?? null,
      source: "manual",
      raw: {},
    } as never,
    { onConflict: "account_id,captured_date" }
  );
  if (error) return { ok: false, error: error.message };

  // Cermin ke kartu akun supaya daftar akun tidak perlu join.
  if (input.followerCount != null) {
    await db
      .from("social_accounts" as never)
      .update({ follower_count_cache: input.followerCount } as never)
      .eq("id", input.accountId);
  }
  revalidateSocial();
  return { ok: true };
}

// ─── Target KPI ────────────────────────────────────────────────────────────

const targetSchema = z
  .object({
    scope: z.enum(["creator", "account", "business_unit"]),
    creatorId: z.string().uuid().nullable().optional(),
    accountId: z.string().uuid().nullable().optional(),
    businessUnitId: z.string().uuid().nullable().optional(),
    metricKey: z.string().refine(isValidMetricKey, "Metrik tidak dikenal"),
    periodType: z.enum(["monthly", "weekly", "custom"]).default("monthly"),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    targetValue: z.number().finite().nonnegative(),
    comparator: z.enum(["gte", "lte"]).default("gte"),
    weight: z.number().finite().positive().default(1),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  // Scope tanpa subjeknya adalah target yang tidak pernah cocok dengan
  // siapa pun — tolak di sini, bukan diam-diam menyimpan baris mati.
  .refine((v) => v.scope !== "creator" || !!v.creatorId, {
    message: "Pilih kreatornya",
  })
  .refine((v) => v.scope !== "account" || !!v.accountId, {
    message: "Pilih akunnya",
  })
  .refine((v) => v.scope !== "business_unit" || !!v.businessUnitId, {
    message: "Pilih unit bisnisnya",
  });

export async function listKpiTargets(): Promise<SocialKpiTarget[]> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return [];
  const db = createAdminClient();
  const { data } = await db
    .from("social_kpi_targets" as never)
    .select("*")
    .eq("is_active", true)
    .order("period_start", { ascending: false });
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const [profs, accs, bus] = await Promise.all([
    db
      .from("profiles")
      .select("id, full_name")
      .in("id", [...new Set(rows.map((r) => r.creator_id).filter(Boolean))]),
    db
      .from("social_accounts" as never)
      .select("id, platform, handle")
      .in("id", [...new Set(rows.map((r) => r.account_id).filter(Boolean))]),
    db
      .from("business_units")
      .select("id, name")
      .in("id", [...new Set(rows.map((r) => r.business_unit_id).filter(Boolean))]),
  ]);
  const pName = new Map((profs.data ?? []).map((p: any) => [p.id, p.full_name]));
  const aName = new Map(
    ((accs.data ?? []) as any[]).map((a) => [a.id, `${a.platform}/@${a.handle}`])
  );
  const bName = new Map((bus.data ?? []).map((b: any) => [b.id, b.name]));

  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    creatorId: r.creator_id,
    creatorName: r.creator_id ? pName.get(r.creator_id) ?? "—" : null,
    accountId: r.account_id,
    accountLabel: r.account_id ? aName.get(r.account_id) ?? "—" : null,
    businessUnitId: r.business_unit_id,
    businessUnitName: r.business_unit_id ? bName.get(r.business_unit_id) ?? "—" : null,
    metricKey: r.metric_key,
    periodType: r.period_type,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    targetValue: Number(r.target_value),
    comparator: r.comparator,
    weight: Number(r.weight),
    notes: r.notes,
    isActive: r.is_active,
  }));
}

export async function upsertKpiTarget(input: unknown): Promise<ActionResult> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid" };
  }
  const v = parsed.data;
  const db = createAdminClient();
  const { error } = await db.from("social_kpi_targets" as never).insert({
    scope: v.scope,
    creator_id: v.creatorId || null,
    account_id: v.accountId || null,
    business_unit_id: v.businessUnitId || null,
    metric_key: v.metricKey,
    period_type: v.periodType,
    period_start: v.periodStart,
    period_end: v.periodEnd || null,
    target_value: v.targetValue,
    comparator: v.comparator,
    weight: v.weight,
    notes: v.notes || null,
    created_by: gate.userId,
  } as never);
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Target untuk metrik & periode itu sudah ada." };
    }
    return { ok: false, error: error.message };
  }
  revalidateSocial();
  return { ok: true };
}

export async function deleteKpiTarget(id: string): Promise<ActionResult> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const db = createAdminClient();
  const { error } = await db
    .from("social_kpi_targets" as never)
    .update({ is_active: false } as never)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateSocial();
  return { ok: true };
}
