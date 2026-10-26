"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireSocialAdmin, type ActionResult } from "./_gates";
import { fetchPnL, type PnLMonth } from "@/lib/cashflow/pnl";
import { fetchYeoboPnL } from "@/lib/cashflow/pnl-yeobo";
import { classifyCategories, usesPosRegime, type CategoryRow } from "@/lib/unit-scorecard/finance";
import { jakartaDateString } from "@/lib/utils/jakarta";
import {
  SOCIAL_METRICS,
  SOCIAL_METRIC_BY_CODE,
  aggregateWeekly,
  engagementRate,
  mondayOf,
  monthRange,
  pickConfig,
  scoreMetric,
  type ConfigVersion,
  type ScoredMetric,
  type SocialMetricCode,
  type WeeklyRow,
} from "@/lib/social/scorecard";

/**
 * Scorecard Sosmed per unit bisnis (Haengbocake, Yeobo Space). Hanya superadmin.
 *
 * Hasil akhir dihitung dari data yang sudah ada; proses dari input mingguan. Tabel baru belum ada di
 * types.ts yang digenerate, jadi query memakai `as never` dan bentuk baris dijaga manual di sini.
 */

const UNIT_NAMES = ["Haengbocake", "Yeobo Space"] as const;
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
const isMonthIso = (s: string) => /^\d{4}-(0[1-9]|1[0-2])-01$/.test(s);
const isDateIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const monthLabel = (monthIso: string) => `${MONTHS_ID[Number(monthIso.slice(5, 7)) - 1]} ${monthIso.slice(0, 4)}`;
const ym = (monthIso: string) => ({ year: Number(monthIso.slice(0, 4)), month: Number(monthIso.slice(5, 7)) });

// ───────────────────────────── Tipe keluaran ─────────────────────────────

export interface ScorecardMetricView extends ScoredMetric {
  label: string;
  group: "hasil" | "proses";
  kind: "rupiah" | "count" | "pct";
  note: string;
  greenBound: number | null;
  redBound: number | null;
  /** Rincian angka untuk panel penelusuran. */
  inputs: Record<string, unknown>;
}

export interface WeeklyView extends WeeklyRow {
  id: string;
  notes: string | null;
  enteredAt: string;
}

export interface ConfigHistoryRow {
  metricCode: SocialMetricCode;
  targetValue: number | null;
  greenBound: number;
  redBound: number;
  effectiveFrom: string;
  reason: string;
  createdAt: string;
}

export interface SocialScorecardUnit {
  businessUnitId: string;
  name: string;
  accountCount: number;
  metrics: ScorecardMetricView[];
  weeks: WeeklyView[];
  history: ConfigHistoryRow[];
}

export interface SocialScorecardData {
  month: string;
  monthLabel: string;
  currentWeekStart: string;
  units: SocialScorecardUnit[];
}

// ───────────────────────────── Pembacaan ─────────────────────────────

type Db = ReturnType<typeof createAdminClient>;

interface ConfigRow {
  business_unit_id: string;
  metric_code: SocialMetricCode;
  target_value: string | number | null;
  green_bound: string | number;
  red_bound: string | number;
  effective_from: string;
  reason: string;
  created_at: string;
}

function toVersion(r: ConfigRow): ConfigVersion {
  return {
    metricCode: r.metric_code,
    targetValue: r.target_value == null ? null : Number(r.target_value),
    greenBound: Number(r.green_bound),
    redBound: Number(r.red_bound),
    effectiveFrom: r.effective_from,
    createdAt: r.created_at,
  };
}

function categoryRows(rows: { category: string; credit: number; debit: number; kind: "operating" | "nonop" }[]): CategoryRow[] {
  return rows.map((r) => ({ category: r.category, credit: r.credit, debit: r.debit, kind: r.kind }));
}

/** Omset Haengbocake: sama dengan Scorecard Unit (POS + custom cake + other revenue sejak Mei 2026; sebelumnya laporan laba-rugi). */
async function haengbocakeRevenue(db: Db, month: string, pnl: PnLMonth | undefined): Promise<{ value: number | null; inputs: Record<string, unknown> }> {
  if (!pnl) return { value: null, inputs: { catatan: "Laporan laba-rugi bulan ini belum tersedia." } };
  const { from, toExcl } = monthRange(month);
  const to = new Date(`${toExcl}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() - 1);
  const toIso = to.toISOString().slice(0, 10);
  const branches = ["Pare", "Semarang"] as const;
  let total = 0;
  const detail: Record<string, unknown> = {};
  for (const b of branches) {
    const br = pnl.byBranch[b];
    const fin = br ? classifyCategories(categoryRows(br.byCategory)) : null;
    if (!usesPosRegime(month)) {
      const v = fin?.pnlRevenue ?? 0;
      total += v;
      detail[b] = { laba_rugi_rp: Math.round(v) };
      continue;
    }
    const r = await db.rpc("scorecard_pos_total" as never, { p_pos_branch: b, p_from: from, p_to: toIso } as never);
    if (r.error) throw new Error(r.error.message);
    const pos = num(r.data);
    const cake = num(b === "Pare" ? pnl.salesHint?.cakePare : pnl.salesHint?.cakeSemarang);
    const other = fin?.otherRevenue ?? 0;
    total += pos + cake + other;
    detail[b] = { pos_rp: Math.round(pos), custom_cake_rp: Math.round(cake), other_revenue_rp: Math.round(other) };
  }
  return { value: total, inputs: { sumber: usesPosRegime(month) ? "POS + custom cake (Pare + Semarang)" : "Laporan laba-rugi", ...detail } };
}

async function yeoboRevenue(sb: Db, month: string): Promise<{ value: number | null; inputs: Record<string, unknown> }> {
  const rep = await fetchYeoboPnL(sb, ym(month), ym(month));
  const m = rep.months[0];
  if (!m) return { value: null, inputs: { catatan: "Laporan laba-rugi bulan ini belum tersedia." } };
  let total = 0;
  const detail: Record<string, number> = {};
  for (const [branch, br] of Object.entries(m.byBranch)) {
    const v = classifyCategories(categoryRows(br.byCategory)).pnlRevenue;
    detail[branch] = Math.round(v);
    total += v;
  }
  return { value: total, inputs: { sumber: "Laporan laba-rugi Yeobo Space (semua cabang)", per_cabang_rp: detail } };
}

interface AccountMetricRow {
  account_id: string;
  captured_date: string;
  follower_count: number | null;
  impressions: number | null;
  reach: number | null;
}

interface PostRow {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reach: number | null;
  impressions: number | null;
}

/** Hasil dari tabel sosmed untuk satu unit: followers (pertumbuhan), impressions, reach, engagement. */
async function socialOutcomes(db: Db, accountIds: string[], month: string) {
  const empty = {
    followers: null as number | null,
    impressions: null as number | null,
    reach: null as number | null,
    engagement: null as number | null,
    inputs: {} as Record<string, Record<string, unknown>>,
  };
  if (accountIds.length === 0) return { ...empty, inputs: { catatan: { teks: "Belum ada akun sosmed aktif untuk unit ini." } } };
  const { from, toExcl } = monthRange(month);

  const [{ data: before }, { data: inMonth }, { data: posts }] = await Promise.all([
    db
      .from("social_account_metrics" as never)
      .select("account_id, captured_date, follower_count")
      .in("account_id", accountIds)
      .lt("captured_date", from)
      .not("follower_count", "is", null)
      .order("captured_date", { ascending: false })
      .limit(accountIds.length * 40),
    db
      .from("social_account_metrics" as never)
      .select("account_id, captured_date, follower_count, impressions, reach")
      .in("account_id", accountIds)
      .gte("captured_date", from)
      .lt("captured_date", toExcl)
      .order("captured_date", { ascending: true }),
    db
      .from("social_posts" as never)
      .select("likes, comments, shares, saves, reach, impressions")
      .in("account_id", accountIds)
      .eq("is_deleted", false)
      .gte("published_date", from)
      .lt("published_date", toExcl),
  ]);

  const mrows = (inMonth ?? []) as unknown as AccountMetricRow[];
  const prows = (posts ?? []) as unknown as PostRow[];
  const prior = new Map<string, number>();
  for (const r of (before ?? []) as unknown as AccountMetricRow[]) if (!prior.has(r.account_id) && r.follower_count != null) prior.set(r.account_id, r.follower_count);

  // Pertumbuhan followers: titik terakhir bulan ini − titik terakhir sebelum bulan (bila tak ada, titik pertama bulan ini).
  let growth = 0;
  let followersNow = 0;
  let hasFollowers = false;
  for (const id of accountIds) {
    const own = mrows.filter((r) => r.account_id === id && r.follower_count != null);
    if (own.length === 0) continue;
    const last = own[own.length - 1].follower_count as number;
    const base = prior.has(id) ? (prior.get(id) as number) : (own[0].follower_count as number);
    growth += last - base;
    followersNow += last;
    hasFollowers = true;
  }

  const sumNonNull = (xs: (number | null)[]): number | null => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  let impressions = sumNonNull(mrows.map((r) => r.impressions));
  let reach = sumNonNull(mrows.map((r) => r.reach));
  const impressionsFromPosts = impressions == null;
  const reachFromPosts = reach == null;
  if (impressions == null) impressions = sumNonNull(prows.map((p) => p.impressions));
  if (reach == null) reach = sumNonNull(prows.map((p) => p.reach));

  const eng = engagementRate(prows);
  return {
    followers: hasFollowers ? growth : null,
    impressions,
    reach,
    engagement: eng,
    inputs: {
      followers: { akun_dengan_data: accountIds.length, followers_akhir_bulan: followersNow, pertumbuhan: growth, hari_tercatat: mrows.length },
      impressions: { sumber: impressionsFromPosts ? "jumlah impressions postingan (metrik akun belum ada)" : "metrik harian akun" },
      reach: { sumber: reachFromPosts ? "jumlah reach postingan (metrik akun belum ada)" : "metrik harian akun" },
      engagement: { postingan_bulan_ini: prows.length, postingan_dengan_reach: prows.filter((p) => (p.reach ?? 0) > 0).length },
    },
  };
}

export async function getSocialScorecard(monthIso?: string | null): Promise<ActionResult<SocialScorecardData>> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return fail(gate.error);
  const today = jakartaDateString(new Date());
  const month = monthIso ?? `${today.slice(0, 7)}-01`;
  if (!isMonthIso(month)) return fail("Bulan tidak valid");
  const { from, toExcl } = monthRange(month);

  try {
    const db = createAdminClient();
    const { data: bus, error: buErr } = await db.from("business_units").select("id, name").in("name", [...UNIT_NAMES]);
    if (buErr) return fail(buErr.message);
    const units = UNIT_NAMES.map((n) => (bus ?? []).find((b) => b.name === n)).filter((b): b is { id: string; name: string } => !!b);
    if (units.length === 0) return fail("Unit bisnis Haengbocake / Yeobo Space tidak ditemukan.");
    const ids = units.map((u) => u.id);

    const [cfgRes, weeklyRes, accRes] = await Promise.all([
      db.from("social_scorecard_config" as never).select("*").in("business_unit_id", ids).order("effective_from", { ascending: false }).order("created_at", { ascending: false }),
      db.from("social_scorecard_weekly" as never).select("*").in("business_unit_id", ids).gte("week_start", from).lt("week_start", toExcl).order("week_start", { ascending: true }),
      db.from("social_accounts" as never).select("id, business_unit_id").in("business_unit_id", ids).eq("is_active", true),
    ]);
    if (cfgRes.error) return fail(cfgRes.error.message);
    if (weeklyRes.error) return fail(weeklyRes.error.message);
    if (accRes.error) return fail(accRes.error.message);
    const cfgRows = (cfgRes.data ?? []) as unknown as ConfigRow[];
    const weekRows = (weeklyRes.data ?? []) as unknown as Record<string, unknown>[];
    const accRows = (accRes.data ?? []) as unknown as { id: string; business_unit_id: string }[];

    // Omset: laporan laba-rugi dimuat sekali per merek.
    const [haengPnl] = units.some((u) => u.name === "Haengbocake") ? (await fetchPnL(db, "Haengbocake", ym(month), ym(month))).months : [undefined];

    const out: SocialScorecardUnit[] = [];
    for (const u of units) {
      const accountIds = accRows.filter((a) => a.business_unit_id === u.id).map((a) => a.id);
      const versions = cfgRows.filter((c) => c.business_unit_id === u.id).map(toVersion);
      const cfgFor = (code: SocialMetricCode) => pickConfig(versions.filter((v) => v.metricCode === code), from);

      const weeks: WeeklyView[] = weekRows
        .filter((w) => w.business_unit_id === u.id)
        .map((w) => ({
          id: String(w.id),
          weekStart: String(w.week_start),
          postsScheduled: num(w.posts_scheduled),
          postsOnTime: num(w.posts_on_time),
          backupStock: num(w.backup_stock),
          messagesReceived: num(w.messages_received),
          messagesRepliedOnTime: num(w.messages_replied_on_time),
          commentsReceived: num(w.comments_received),
          commentsRepliedOnTime: num(w.comments_replied_on_time),
          notes: (w.notes as string | null) ?? null,
          enteredAt: String(w.entered_at),
        }));

      const [rev, so] = await Promise.all([
        u.name === "Haengbocake" ? haengbocakeRevenue(db, month, haengPnl) : yeoboRevenue(db, month),
        socialOutcomes(db, accountIds, month),
      ]);
      const proc = aggregateWeekly(weeks, cfgFor("p_stok")?.targetValue ?? null);

      const actualOf: Record<SocialMetricCode, number | null> = {
        omset: rev.value,
        followers: so.followers,
        impressions: so.impressions,
        reach: so.reach,
        engagement: so.engagement,
        p_kalender: proc.kalender,
        p_stok: proc.stok,
        p_balasan: proc.balasan,
      };
      const inputsOf: Record<SocialMetricCode, Record<string, unknown>> = {
        omset: rev.inputs,
        followers: so.inputs.followers ?? {},
        impressions: so.inputs.impressions ?? {},
        reach: so.inputs.reach ?? {},
        engagement: so.inputs.engagement ?? {},
        p_kalender: { minggu_terisi: proc.weeks, unggahan_terjadwal: proc.detail.postsScheduled, tayang_tepat_waktu: proc.detail.postsOnTime },
        p_stok: { minggu_terisi: proc.weeks, minggu_memenuhi_minimum: proc.detail.weeksWithStock, minimum_konten: cfgFor("p_stok")?.targetValue ?? null },
        p_balasan: {
          pesan_masuk: proc.detail.messagesReceived,
          pesan_dibalas_tepat_waktu: proc.detail.messagesRepliedOnTime,
          komentar_masuk: proc.detail.commentsReceived,
          komentar_dibalas_tepat_waktu: proc.detail.commentsRepliedOnTime,
        },
      };

      const metrics: ScorecardMetricView[] = SOCIAL_METRICS.map((def) => {
        const cfg = cfgFor(def.code);
        const scored = scoreMetric(def, actualOf[def.code], cfg);
        return {
          ...scored,
          label: def.label,
          group: def.group,
          kind: def.kind,
          note: def.note,
          greenBound: cfg?.greenBound ?? null,
          redBound: cfg?.redBound ?? null,
          inputs: inputsOf[def.code],
        };
      });

      out.push({
        businessUnitId: u.id,
        name: u.name,
        accountCount: accountIds.length,
        metrics,
        weeks,
        history: cfgRows
          .filter((c) => c.business_unit_id === u.id)
          .slice(0, 40)
          .map((c) => ({
            metricCode: c.metric_code,
            targetValue: c.target_value == null ? null : Number(c.target_value),
            greenBound: Number(c.green_bound),
            redBound: Number(c.red_bound),
            effectiveFrom: c.effective_from,
            reason: c.reason,
            createdAt: c.created_at,
          })),
      });
    }

    return { ok: true, data: { month, monthLabel: monthLabel(month), currentWeekStart: mondayOf(today), units: out } };
  } catch (e) {
    return fail(errMsg(e));
  }
}

// ───────────────────────────── Penulisan ─────────────────────────────

export interface WeeklyInput {
  businessUnitId: string;
  weekStart: string;
  postsScheduled: number;
  postsOnTime: number;
  backupStock: number;
  messagesReceived: number;
  messagesRepliedOnTime: number;
  commentsReceived: number;
  commentsRepliedOnTime: number;
  notes?: string | null;
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 1_000_000;

/** Simpan (atau timpa) input mingguan satu unit. Minggu selalu dinormalkan ke Senin. */
export async function saveSocialWeekly(input: WeeklyInput): Promise<ActionResult> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!input.businessUnitId) return fail("Unit wajib dipilih");
  if (!isDateIso(input.weekStart)) return fail("Tanggal minggu tidak valid");
  const counts = [input.postsScheduled, input.postsOnTime, input.backupStock, input.messagesReceived, input.messagesRepliedOnTime, input.commentsReceived, input.commentsRepliedOnTime];
  if (!counts.every(isCount)) return fail("Semua angka harus bilangan bulat ≥ 0");
  if (input.postsOnTime > input.postsScheduled) return fail("Unggahan tepat waktu tidak boleh melebihi unggahan terjadwal");
  if (input.messagesRepliedOnTime > input.messagesReceived) return fail("Pesan dibalas tepat waktu tidak boleh melebihi pesan masuk");
  if (input.commentsRepliedOnTime > input.commentsReceived) return fail("Komentar dibalas tepat waktu tidak boleh melebihi komentar masuk");
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 500) return fail("Catatan maksimal 500 karakter");

  const db = createAdminClient();
  const { error } = await db.from("social_scorecard_weekly" as never).upsert(
    {
      business_unit_id: input.businessUnitId,
      week_start: mondayOf(input.weekStart),
      posts_scheduled: input.postsScheduled,
      posts_on_time: input.postsOnTime,
      backup_stock: input.backupStock,
      messages_received: input.messagesReceived,
      messages_replied_on_time: input.messagesRepliedOnTime,
      comments_received: input.commentsReceived,
      comments_replied_on_time: input.commentsRepliedOnTime,
      notes,
      entered_by: gate.userId,
      entered_at: new Date().toISOString(),
    } as never,
    { onConflict: "business_unit_id,week_start" }
  );
  if (error) return fail(error.message);
  revalidatePath("/admin/social/scorecard");
  return { ok: true };
}

export async function deleteSocialWeekly(id: string): Promise<ActionResult> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return fail(gate.error);
  const db = createAdminClient();
  const { error } = await db.from("social_scorecard_weekly" as never).delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/admin/social/scorecard");
  return { ok: true };
}

export interface ConfigInput {
  businessUnitId: string;
  metricCode: SocialMetricCode;
  /** null = kosongkan target. */
  targetValue: number | null;
  greenBound: number;
  redBound: number;
  /** Berlaku mulai bulan ini (YYYY-MM-01). */
  effectiveFrom: string;
  reason: string;
}

/** Versi baru target + ambang (riwayat lama tetap tersimpan). Alasan wajib. */
export async function saveSocialScorecardConfig(input: ConfigInput): Promise<ActionResult> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!input.businessUnitId) return fail("Unit wajib dipilih");
  if (!SOCIAL_METRIC_BY_CODE.has(input.metricCode)) return fail("Metrik tidak dikenal");
  if (!isMonthIso(input.effectiveFrom)) return fail("Bulan berlaku tidak valid");
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 5) return fail("Alasan perubahan wajib diisi (minimal 5 karakter)");
  if (![input.greenBound, input.redBound].every((n) => Number.isFinite(n) && n >= 0 && n <= 1000)) return fail("Batas hijau/merah tidak valid");
  if (input.greenBound < input.redBound) return fail("Batas hijau tidak boleh lebih kecil dari batas merah");
  if (input.targetValue != null && !(Number.isFinite(input.targetValue) && input.targetValue >= 0)) return fail("Target tidak valid");

  const db = createAdminClient();
  const { error } = await db.from("social_scorecard_config" as never).insert({
    business_unit_id: input.businessUnitId,
    metric_code: input.metricCode,
    target_value: input.targetValue,
    green_bound: input.greenBound,
    red_bound: input.redBound,
    effective_from: input.effectiveFrom,
    changed_by: gate.userId,
    reason,
  } as never);
  if (error) return fail(error.message);
  revalidatePath("/admin/social/scorecard");
  return { ok: true };
}
