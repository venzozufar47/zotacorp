"use server";

import { requireMetaAdsAccess } from "./_gates";
import { META_ADS_ACCOUNTS, type MetaAdsAccountKey } from "@/lib/meta-ads/accounts";

/**
 * Meta Marketing API (Ads Insights) — spend/hasil kampanye ads Yeobo
 * Space, TERPISAH dari modul "Sosmed & KPI" (`social.actions.ts`) yang
 * hanya cover insight organik. Butuh System User token (`ads_read`) +
 * Ad Account ID di env, dibuat manual oleh admin lewat Meta Business
 * Manager — lihat percakapan setup, tidak ada UI untuk generate token
 * di sini karena itu wewenang pemilik akun Meta, bukan aplikasi ini.
 */

const GRAPH_VERSION = "v21.0";

/**
 * Action types yang dianggap "Hasil" bermakna bisnis, diurutkan dari yang
 * paling spesifik (purchase) ke paling generik (klik link) — dipakai
 * sebagai fallback karena satu ad account bisa punya campaign dengan
 * objective berbeda-beda (conversion, lead, traffic, dst) dan API tidak
 * memberi satu angka "Results" yang seragam di level account.
 */
const RESULT_ACTION_PRIORITY = [
  { type: "onsite_conversion.purchase", label: "Pembelian" },
  { type: "purchase", label: "Pembelian" },
  { type: "offsite_conversion.fb_pixel_purchase", label: "Pembelian" },
  { type: "onsite_conversion.lead_grouped", label: "Lead" },
  { type: "lead", label: "Lead" },
  { type: "complete_registration", label: "Registrasi" },
  { type: "onsite_conversion.messaging_conversation_started_7d", label: "Chat dimulai" },
  // Meta tidak punya action_type khusus "profile visit" — utk ad set
  // dengan optimization_goal PROFILE_VISIT (destination = profil
  // Instagram), "landing page"-nya YA profil itu sendiri, jadi
  // dihitung lewat landing_page_view yang sama dipakai traffic-ke-
  // website biasa. Labelnya di-override di summarize() berdasarkan
  // optimization_goal ad set — "Kunjungan Halaman" di sini cuma
  // fallback generik kalau goal-nya bukan PROFILE_VISIT.
  { type: "landing_page_view", label: "Kunjungan Halaman" },
  { type: "link_click", label: "Klik link" },
] as const;

const PURCHASE_VALUE_ACTION_TYPES = [
  "omni_purchase",
  "purchase",
  "onsite_conversion.purchase",
  "offsite_conversion.fb_pixel_purchase",
];

interface RawAction {
  action_type: string;
  value: string;
}

interface RawInsightsRow {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_name?: string;
  effective_status?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  cpm?: string;
  cpc?: string;
  clicks?: string;
  actions?: RawAction[];
  action_values?: RawAction[];
}

export interface MetaAdsSnapshot {
  spend: number;
  impressions: number;
  reach: number;
  cpm: number | null;
  cpc: number | null;
  clicks: number;
  results: number | null;
  resultLabel: string | null;
  costPerResult: number | null;
  purchaseValue: number | null;
  roas: number | null;
}

export interface MetaAdsAdRow extends MetaAdsSnapshot {
  adId: string;
  adName: string;
  statusLabel: string;
  statusActive: boolean;
}

export interface MetaAdsAdsetGroup {
  adsetId: string;
  adsetName: string;
  campaignName: string;
  statusLabel: string;
  statusActive: boolean;
  /** ISO timestamp ad set dibuat, "" kalau tidak diketahui. */
  createdTime: string;
  /** Total ad set — dari fetch level=adset langsung (otoritatif; CPM/CPC
   *  tidak bisa sekadar dijumlah dari baris-baris ad di bawahnya). */
  totals: MetaAdsSnapshot;
  /** Ads di dalam ad set ini, diurutkan spend terbesar dulu. */
  ads: MetaAdsAdRow[];
}

export type MetaAdsPeriod = "this_month" | "last_month";

export interface MetaAdsInsights {
  today: MetaAdsSnapshot;
  /** Total periode yang dipilih (bulan ini ATAU bulan lalu — lihat `period`). */
  month: MetaAdsSnapshot;
  period: MetaAdsPeriod;
  /** Rincian periode yang dipilih, dikelompokkan per ad set, diurutkan
   *  spend ad set terbesar dulu. */
  adsetGroups: MetaAdsAdsetGroup[];
  accountName: string;
}

export type MetaAdsInsightsResult =
  | { ok: true; data: MetaAdsInsights }
  | { ok: false; error: string };

function num(v: string | undefined): number {
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * `date_preset=this_month` mengembalikan SEMUA ad/ad set yang punya spend
 * kapan pun bulan ini — termasuk yang sudah di-pause/diarsipkan setelah
 * itu, bukan cuma yang aktif SEKARANG. Itu benar untuk total spend bulan
 * berjalan (uang yang sudah keluar tetap dihitung), tapi bikin baris
 * tabel breakdown lebih banyak dari jumlah campaign/ad set/ad yang aktif
 * saat dilihat — jadi setiap baris diberi label status biar jelas,
 * bukan disembunyikan begitu saja (menyembunyikan baris nonaktif akan
 * membuat total tabel tidak lagi cocok dengan kartu Spend di atasnya).
 */
function describeStatus(status: string | undefined): {
  label: string;
  active: boolean;
} {
  if (status === "ACTIVE") return { label: "Aktif", active: true };
  if (!status) return { label: "—", active: false };
  if (status === "PAUSED" || status === "CAMPAIGN_PAUSED" || status === "ADSET_PAUSED")
    return { label: "Nonaktif", active: false };
  if (status === "ARCHIVED" || status === "DELETED")
    return { label: "Diarsipkan", active: false };
  return { label: status, active: false };
}

function summarize(row: RawInsightsRow | undefined, optimizationGoal?: string): MetaAdsSnapshot {
  const spend = num(row?.spend);
  const actions = row?.actions ?? [];
  const actionValues = row?.action_values ?? [];

  let results: number | null = null;
  let resultLabel: string | null = null;
  for (const candidate of RESULT_ACTION_PRIORITY) {
    const found = actions.find((a) => a.action_type === candidate.type);
    if (found) {
      results = num(found.value);
      resultLabel =
        candidate.type === "landing_page_view" && optimizationGoal === "PROFILE_VISIT"
          ? "Kunjungan Profil"
          : candidate.label;
      break;
    }
  }

  let purchaseValue: number | null = null;
  for (const type of PURCHASE_VALUE_ACTION_TYPES) {
    const found = actionValues.find((a) => a.action_type === type);
    if (found) {
      purchaseValue = num(found.value);
      break;
    }
  }

  return {
    spend,
    impressions: num(row?.impressions),
    reach: num(row?.reach),
    cpm: row?.cpm ? num(row.cpm) : null,
    cpc: row?.cpc ? num(row.cpc) : null,
    clicks: num(row?.clicks),
    results,
    resultLabel,
    costPerResult: results && results > 0 ? spend / results : null,
    purchaseValue,
    roas: purchaseValue != null && spend > 0 ? purchaseValue / spend : null,
  };
}

/** Satu tempat untuk build URL + fetch + cek error Graph API — dipakai
 *  semua fetcher di bawah supaya boilerplate-nya tidak diulang 5x. */
async function graphFetch<T>(
  path: string,
  params: Record<string, string>,
  token: string
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) {
    const message =
      json?.error?.message ?? `Meta API error (HTTP ${res.status})`;
    throw new Error(message);
  }
  return json as T;
}

async function fetchInsights(
  accountId: string,
  token: string,
  datePreset: "today" | MetaAdsPeriod
): Promise<RawInsightsRow | undefined> {
  const json = await graphFetch<{ data?: RawInsightsRow[] }>(
    `${accountId}/insights`,
    { fields: "spend,impressions,reach,cpm,cpc,clicks,actions,action_values", date_preset: datePreset },
    token
  );
  return json.data?.[0];
}

/**
 * `effective_status`/`created_time`/`optimization_goal` bukan field yang
 * sah di endpoint /insights (itu properti objek ad/adset, bukan metrik
 * performa) — harus diambil terpisah dari edge /ads atau /adsets lalu
 * digabung manual by id. Satu fungsi untuk kedua edge (bukan dua fungsi
 * hampir identik) karena bentuknya memang sama, cuma edge-nya beda.
 * `optimization_goal` cuma diminta utk /adsets — bukan field yang sah di
 * objek Ad, dan ad mewarisi goal ad set induknya lewat adset_id saja.
 */
async function fetchEdgeMeta(
  accountId: string,
  token: string,
  edge: "ads" | "adsets"
): Promise<Map<string, { status: string; createdTime: string; optimizationGoal?: string }>> {
  const fields =
    edge === "adsets"
      ? "id,effective_status,created_time,optimization_goal"
      : "id,effective_status,created_time";
  const json = await graphFetch<{
    data?: {
      id: string;
      effective_status?: string;
      created_time?: string;
      optimization_goal?: string;
    }[];
  }>(`${accountId}/${edge}`, { fields, limit: "500" }, token);
  const rows = json.data ?? [];
  return new Map(
    rows.map((r) => [
      r.id,
      { status: r.effective_status ?? "", createdTime: r.created_time ?? "", optimizationGoal: r.optimization_goal },
    ])
  );
}

async function fetchLevelBreakdown(
  accountId: string,
  token: string,
  level: "ad" | "adset",
  fields: string,
  period: MetaAdsPeriod
): Promise<RawInsightsRow[]> {
  const json = await graphFetch<{ data?: RawInsightsRow[] }>(
    `${accountId}/insights`,
    { fields, level, date_preset: period, limit: "200" },
    token
  );
  return json.data ?? [];
}

/**
 * Rincian bulan berjalan dikelompokkan per ad set: totals ad set diambil
 * LANGSUNG dari fetch level=adset (bukan dijumlah dari baris ad di
 * bawahnya) karena CPM/CPC ad set bukan rata-rata sederhana dari
 * ad-ad-nya. Ads di dalam tiap grup tetap dari fetch level=ad, dicocokkan
 * lewat adset_id.
 */
async function fetchAdsetGroups(
  accountId: string,
  token: string,
  period: MetaAdsPeriod
): Promise<MetaAdsAdsetGroup[]> {
  const adFields =
    "ad_id,ad_name,adset_id,adset_name,campaign_name,spend,impressions,reach,cpm,cpc,clicks,actions,action_values";
  const adsetFields =
    "adset_id,adset_name,campaign_name,spend,impressions,reach,cpm,cpc,clicks,actions,action_values";

  const [adRows, adsetRows, adMetaById, adsetMetaById] = await Promise.all([
    fetchLevelBreakdown(accountId, token, "ad", adFields, period),
    fetchLevelBreakdown(accountId, token, "adset", adsetFields, period),
    fetchEdgeMeta(accountId, token, "ads"),
    fetchEdgeMeta(accountId, token, "adsets"),
  ]);

  const ads = adRows.map((row) => {
    const status = describeStatus(adMetaById.get(row.ad_id ?? "")?.status);
    // Ad tidak punya optimization_goal sendiri — pakai milik ad set induk
    // supaya label "Kunjungan Profil" konsisten antara baris ad set dan
    // ad-ad di dalamnya.
    const optimizationGoal = adsetMetaById.get(row.adset_id ?? "")?.optimizationGoal;
    return {
      adsetId: row.adset_id ?? "",
      adId: row.ad_id ?? "",
      adName: row.ad_name ?? "(tanpa nama)",
      statusLabel: status.label,
      statusActive: status.active,
      ...summarize(row, optimizationGoal),
    };
  });

  return adsetRows
    .map((row) => {
      const adsetId = row.adset_id ?? "";
      const meta = adsetMetaById.get(adsetId);
      const status = describeStatus(meta?.status);
      return {
        adsetId,
        adsetName: row.adset_name ?? "(tanpa nama)",
        campaignName: row.campaign_name ?? "",
        statusLabel: status.label,
        statusActive: status.active,
        createdTime: meta?.createdTime ?? "",
        totals: summarize(row, meta?.optimizationGoal),
        ads: ads
          .filter((a) => a.adsetId === adsetId)
          .sort((a, b) => b.spend - a.spend),
      };
    })
    .sort((a, b) => b.totals.spend - a.totals.spend);
}

/** Nama akun iklan (bukan cuma ID) untuk ditampilkan di UI. Gagal diam-diam
 *  ke accountId — ini cuma label tampilan, bukan data krusial. */
async function fetchAccountName(accountId: string, token: string): Promise<string> {
  try {
    const json = await graphFetch<{ name?: string }>(accountId, { fields: "name" }, token);
    return json.name ?? accountId;
  } catch {
    return accountId;
  }
}

export async function getMetaAdsInsights(
  accountKey: MetaAdsAccountKey = "yeobo",
  period: MetaAdsPeriod = "this_month"
): Promise<MetaAdsInsightsResult> {
  const gate = await requireMetaAdsAccess();
  if (!gate.ok) return { ok: false, error: gate.error };

  const cfg = META_ADS_ACCOUNTS[accountKey];
  const token = process.env[cfg.tokenEnv];
  const accountId = process.env[cfg.accountEnv];
  if (!token || !accountId) {
    return {
      ok: false,
      error: `${cfg.tokenEnv} / ${cfg.accountEnv} belum diset di .env.local.`,
    };
  }

  try {
    const [todayRow, monthRow, adsetGroups, accountName] = await Promise.all([
      fetchInsights(accountId, token, "today"),
      fetchInsights(accountId, token, period),
      fetchAdsetGroups(accountId, token, period),
      fetchAccountName(accountId, token),
    ]);
    return {
      ok: true,
      data: {
        today: summarize(todayRow),
        month: summarize(monthRow),
        period,
        adsetGroups,
        accountName,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal memuat data Meta Ads",
    };
  }
}
