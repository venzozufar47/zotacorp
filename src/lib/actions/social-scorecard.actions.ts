"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireSocialAdmin, type ActionResult } from "./_gates";
import { fetchPnL, type PnLMonth } from "@/lib/cashflow/pnl";
import { fetchYeoboPnL, type YeoboPnLMonth } from "@/lib/cashflow/pnl-yeobo";
import { classifyCategories, usesPosRegime, type CategoryRow } from "@/lib/unit-scorecard/finance";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { getCurrentUser } from "@/lib/supabase/cached";
import { editorBrandIds } from "@/lib/social/access";
import {
  SOCIAL_METRICS,
  SOCIAL_METRIC_BY_CODE,
  engagementOf,
  followersGrowthOf,
  lastMonths,
  monthRange,
  pickConfig,
  reachOf,
  reportsInMonth,
  scoreMetric,
  type ConfigVersion,
  type ReportRow,
  type ScoredMetric,
  type SocialMetricCode,
} from "@/lib/social/scorecard";

/**
 * Scorecard Sosmed per brand (Haengbocake.idn → Semarang, haengbo.corner → Pare, yeobospace.id → Yeobo Space).
 * Hanya superadmin. Empat metrik: reach, omset, pertumbuhan followers, engagement rate — tiga di antaranya dihitung
 * dari laporan mingguan, omset dari laporan keuangan/POS (sama dengan Scorecard Unit).
 *
 * Tabel baru belum ada di types.ts yang digenerate, jadi query memakai `as never` dan bentuk baris dijaga manual di sini.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Gagal");
const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
const isMonthIso = (s: string) => /^\d{4}-(0[1-9]|1[0-2])-01$/.test(s);

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const monthLabel = (monthIso: string) => `${MONTHS_ID[Number(monthIso.slice(5, 7)) - 1]} ${monthIso.slice(0, 4)}`;
const ym = (monthIso: string) => ({ year: Number(monthIso.slice(0, 4)), month: Number(monthIso.slice(5, 7)) });
const TREND_MONTHS = 6;

/** Cabang keuangan tiap brand. */
const BRAND_REVENUE: Record<string, { kind: "haeng"; branch: "Semarang" | "Pare" } | { kind: "yeobo" }> = {
  haengbocake_idn: { kind: "haeng", branch: "Semarang" },
  haengbo_corner: { kind: "haeng", branch: "Pare" },
  yeobospace_id: { kind: "yeobo" },
};

// ───────────────────────────── Tipe keluaran ─────────────────────────────

export interface BrandMetricView extends ScoredMetric {
  label: string;
  kind: "rupiah" | "count" | "pct";
  note: string;
  greenBound: number | null;
  redBound: number | null;
  /** Nilai aktual per bulan (lama → baru) untuk grafik tren. */
  spark: (number | null)[];
  /** Rincian angka untuk keterangan kecil di kartu. */
  inputs: Record<string, unknown>;
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

export interface SocialBrandCard {
  brandId: string;
  code: string;
  label: string;
  /** Berapa dari seluruh akun brand yang punya laporan bulan ini. */
  accountsReporting: number;
  accountCount: number;
  /** Jumlah minggu (Senin) yang masuk bulan ini dan sudah punya laporan. */
  weeksReported: number;
  metrics: BrandMetricView[];
  history: ConfigHistoryRow[];
}

export interface SocialScorecardData {
  month: string;
  monthLabel: string;
  trendMonths: string[];
  brands: SocialBrandCard[];
}

// ───────────────────────────── Omset ─────────────────────────────

type Db = ReturnType<typeof createAdminClient>;

function categoryRows(rows: { category: string; credit: number; debit: number; kind: "operating" | "nonop" }[]): CategoryRow[] {
  return rows.map((r) => ({ category: r.category, credit: r.credit, debit: r.debit, kind: r.kind }));
}

/** Omset satu cabang Haengbocake: POS + custom cake + other revenue sejak Mei 2026; sebelumnya laporan laba-rugi. */
async function haengBranchRevenue(db: Db, month: string, pnl: PnLMonth | undefined, branch: "Semarang" | "Pare"): Promise<number | null> {
  if (!pnl) return null;
  const br = pnl.byBranch[branch];
  const fin = br ? classifyCategories(categoryRows(br.byCategory)) : null;
  if (!usesPosRegime(month)) return fin?.pnlRevenue ?? 0;
  const { from, toExcl } = monthRange(month);
  const to = new Date(`${toExcl}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() - 1);
  const r = await db.rpc("scorecard_pos_total" as never, { p_pos_branch: branch, p_from: from, p_to: to.toISOString().slice(0, 10) } as never);
  if (r.error) throw new Error(r.error.message);
  const cake = num(branch === "Pare" ? pnl.salesHint?.cakePare : pnl.salesHint?.cakeSemarang);
  return num(r.data) + cake + (fin?.otherRevenue ?? 0);
}

function yeoboMonthRevenue(m: YeoboPnLMonth | undefined): number | null {
  if (!m) return null;
  let total = 0;
  for (const br of Object.values(m.byBranch)) total += classifyCategories(categoryRows(br.byCategory)).pnlRevenue;
  return total;
}

/** Rincian omset per cabang Yeobo (urut nama) untuk satu bulan. */
function yeoboBranchRevenue(m: YeoboPnLMonth | undefined): { cabang: string; rp: number }[] {
  if (!m) return [];
  return Object.entries(m.byBranch)
    .map(([cabang, br]) => ({ cabang, rp: Math.round(classifyCategories(categoryRows(br.byCategory)).pnlRevenue) }))
    .sort((a, b) => a.cabang.localeCompare(b.cabang));
}

// ───────────────────────────── Pembacaan ─────────────────────────────

interface ConfigRow {
  brand_id: string;
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

export async function getSocialScorecard(monthIso?: string | null): Promise<ActionResult<SocialScorecardData>> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return fail(gate.error);
  return computeSocialScorecard(monthIso, { brandIds: null, employeeView: false });
}

interface ComputeOpts {
  /** null = semua brand. */
  brandIds: string[] | null;
  /** Tampilan karyawan: tanpa omset (angka keuangan) dan tanpa riwayat target. */
  employeeView: boolean;
}

async function computeSocialScorecard(monthIso: string | null | undefined, opts: ComputeOpts): Promise<ActionResult<SocialScorecardData>> {
  const today = jakartaDateString(new Date());
  const month = monthIso ?? `${today.slice(0, 7)}-01`;
  if (!isMonthIso(month)) return fail("Bulan tidak valid");
  const months = lastMonths(month, TREND_MONTHS);
  const first = months[0];

  try {
    const db = createAdminClient();
    const [brandsRes, accountsRes, cfgRes, reportsRes] = await Promise.all([
      db.from("social_brands" as never).select("id, code, label, sort_order").order("sort_order"),
      db.from("social_accounts" as never).select("id, brand_id").eq("is_active", true),
      db.from("social_scorecard_config" as never).select("*").order("effective_from", { ascending: false }).order("created_at", { ascending: false }),
      db.from("social_weekly_reports" as never).select("*").gte("week_start", first).lt("week_start", monthRange(month).toExcl),
    ]);
    for (const r of [brandsRes, accountsRes, cfgRes, reportsRes]) if (r.error) return fail(r.error.message);
    const brands = ((brandsRes.data ?? []) as any[]).filter((b) => !opts.brandIds || opts.brandIds.includes(b.id));
    const accounts = (accountsRes.data ?? []) as any[];
    const cfgRows = (cfgRes.data ?? []) as unknown as ConfigRow[];
    const reports: (ReportRow & { brandId: string })[] = ((reportsRes.data ?? []) as any[]).map((r) => ({
      brandId: accounts.find((a) => a.id === r.account_id)?.brand_id ?? "",
      accountId: r.account_id,
      weekStart: r.week_start,
      views: r.views,
      viewers: r.viewers,
      interactions: r.interactions,
      followers: r.followers,
      follows: r.follows,
      unfollows: r.unfollows,
      posts: r.posts,
      reels: r.reels,
      stories: r.stories,
    }));

    // Laporan keuangan dimuat sekali per merek untuk seluruh rentang tren.
    const needsHaeng = !opts.employeeView && brands.some((b) => BRAND_REVENUE[b.code]?.kind === "haeng");
    const needsYeobo = !opts.employeeView && brands.some((b) => BRAND_REVENUE[b.code]?.kind === "yeobo");
    const [haengPnl, yeoboPnl] = await Promise.all([
      needsHaeng ? fetchPnL(db, "Haengbocake", ym(first), ym(month)) : Promise.resolve(null),
      needsYeobo ? fetchYeoboPnL(db, ym(first), ym(month)) : Promise.resolve(null),
    ]);

    // Target omset brand Haengbocake = target omzet cabangnya di Scorecard Cabang (POS + Custom Cake): SATU sumber, supaya
    // angka target tidak bisa berbeda antara dua scorecard. Brand tanpa target cabang (Yeobo) memakai target sosmed sendiri.
    const branchOmzetTarget = new Map<string, number>();
    if (!opts.employeeView && needsHaeng) {
      const tr = await db.from("scorecard_branch_targets" as never).select("branch, monthly_pos_target, monthly_cake_target");
      for (const t of (tr.data ?? []) as unknown as { branch: string; monthly_pos_target: string | number | null; monthly_cake_target: string | number | null }[]) {
        const sum = (Number(t.monthly_pos_target) || 0) + (Number(t.monthly_cake_target) || 0);
        if (sum > 0) branchOmzetTarget.set(t.branch, sum);
      }
    }

    // Bulan berjalan: omset baru lengkap sampai tanggal data pendapatan terakhir yang masuk ke buku kas.
    const monthInProgress = month === `${today.slice(0, 7)}-01`;
    let yeoboDataUntil: string | null = null;
    if (needsYeobo && monthInProgress) {
      const last = await db
        .from("cashflow_transactions" as never)
        .select("transaction_date, cashflow_statements!inner(bank_accounts!inner(business_unit))")
        .eq("cashflow_statements.bank_accounts.business_unit", "Yeobo Space")
        .in("category", ["Revenue", "Sales", "Other Revenue"])
        .gt("credit", 0)
        .order("transaction_date", { ascending: false })
        .limit(1);
      yeoboDataUntil = ((last.data ?? []) as unknown as { transaction_date: string }[])[0]?.transaction_date ?? null;
    }

    const out: SocialBrandCard[] = [];
    for (const b of brands) {
      const brandAccounts = accounts.filter((a) => a.brand_id === b.id).map((a) => a.id as string);
      const brandReports = reports.filter((r) => r.brandId === b.id);
      const versions = cfgRows.filter((c) => c.brand_id === b.id).map(toVersion);
      const cfgFor = (code: SocialMetricCode, m: string) => pickConfig(versions.filter((v) => v.metricCode === code), m);

      const spec = opts.employeeView ? undefined : BRAND_REVENUE[b.code];
      const revenueOf = async (m: string): Promise<number | null> => {
        if (!spec) return null;
        const { year, month: mm } = ym(m);
        if (spec.kind === "haeng") {
          const pnl = haengPnl?.months.find((x) => x.year === year && x.month === mm);
          return haengBranchRevenue(db, m, pnl, spec.branch);
        }
        return yeoboMonthRevenue(yeoboPnl?.months.find((x) => x.year === year && x.month === mm));
      };
      // Omset berasal dari laporan keuangan/POS; kegagalannya tidak boleh mematikan tiga metrik lain.
      const revFail: { msg: string | null } = { msg: null };
      const revenues = await Promise.all(
        months.map((m) =>
          revenueOf(m).catch((e) => {
            revFail.msg = errMsg(e);
            return null;
          })
        )
      );

      const valuesByMonth = months.map((m, i) => {
        const rs = reportsInMonth(brandReports, m);
        return {
          reach: reachOf(rs),
          omset: revenues[i],
          followers_growth: followersGrowthOf(rs),
          engagement: engagementOf(rs),
        } satisfies Record<SocialMetricCode, number | null>;
      });
      const cur = valuesByMonth[valuesByMonth.length - 1];
      const curReports = reportsInMonth(brandReports, month);
      const accountsReporting = new Set(curReports.map((r) => r.accountId)).size;
      const weeksReported = new Set(curReports.map((r) => r.weekStart)).size;

      const metrics: BrandMetricView[] = SOCIAL_METRICS.filter((def) => !(opts.employeeView && def.code === "omset")).map((def) => {
        let cfg = cfgFor(def.code, month);
        if (def.code === "omset" && spec?.kind === "haeng" && branchOmzetTarget.has(spec.branch)) {
          cfg = {
            metricCode: "omset",
            targetValue: branchOmzetTarget.get(spec.branch)!,
            greenBound: cfg?.greenBound ?? 100,
            redBound: cfg?.redBound ?? 70,
            effectiveFrom: cfg?.effectiveFrom ?? month,
            createdAt: cfg?.createdAt ?? "",
          };
        }
        const scored = scoreMetric(cur[def.code], cfg, def.code);
        const inputs: Record<string, unknown> =
          def.code === "omset"
            ? revFail.msg
              ? { catatan: `Omset belum bisa dihitung: ${revFail.msg}` }
              : {
                  sumber: spec?.kind === "yeobo" ? "Laporan laba-rugi Yeobo Space (semua cabang)" : usesPosRegime(month) ? `POS + custom cake (${spec && spec.kind === "haeng" ? spec.branch : "-"})` : "Laporan laba-rugi",
                  ...(spec?.kind === "yeobo" ? { rincian_cabang: yeoboBranchRevenue(yeoboPnl?.months.find((x) => x.year === ym(month).year && x.month === ym(month).month)) } : {}),
                  ...(monthInProgress ? { bulan_berjalan: true, ...(spec?.kind === "yeobo" && yeoboDataUntil ? { data_sampai: yeoboDataUntil } : {}) } : {}),
                }
            : { minggu_terisi: weeksReported, akun_terisi: `${accountsReporting}/${brandAccounts.length}` };
        return {
          ...scored,
          label: def.label,
          kind: def.kind,
          note: def.note,
          greenBound: cfg?.greenBound ?? null,
          redBound: cfg?.redBound ?? null,
          spark: valuesByMonth.map((v) => v[def.code]),
          inputs,
        };
      });

      out.push({
        brandId: b.id,
        code: b.code,
        label: b.label,
        accountsReporting,
        accountCount: brandAccounts.length,
        weeksReported,
        metrics,
        history: (opts.employeeView ? [] : cfgRows)
          .filter((c) => c.brand_id === b.id)
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
    return { ok: true, data: { month, monthLabel: monthLabel(month), trendMonths: months, brands: out } };
  } catch (e) {
    return fail(errMsg(e));
  }
}

/**
 * Scorecard sosmed untuk BERANDA pengisi laporan: hanya brand yang ia pegang (`social_report_editors`), tanpa omset
 * dan tanpa riwayat target. null = bukan pengisi. `simulateBrandCode` hanya berlaku di luar produksi, untuk meninjau
 * tampilan tanpa mengubah data akses.
 */
export async function getMySocialScorecard(simulateBrandCode?: string | null): Promise<SocialScorecardData | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  let brandIds = await editorBrandIds();
  if (simulateBrandCode && process.env.NODE_ENV !== "production") {
    const { data } = await createAdminClient().from("social_brands" as never).select("id").eq("code", simulateBrandCode).maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    if (id) brandIds = [id];
  }
  if (brandIds.length === 0) return null;
  const res = await computeSocialScorecard(null, { brandIds, employeeView: true });
  return res.ok ? (res.data ?? null) : null;
}

/**
 * Target & ambang yang berlaku bulan ini per brand — TANPA menghitung nilai (tidak menyentuh laporan keuangan/POS),
 * untuk editor target di halaman Sosmed & KPI supaya halaman itu tetap ringan.
 */
export async function getSocialTargets(): Promise<ActionResult<{ month: string; brands: SocialBrandCard[] }>> {
  const gate = await requireSocialAdmin();
  if (!gate.ok) return fail(gate.error);
  const month = `${jakartaDateString(new Date()).slice(0, 7)}-01`;
  try {
    const db = createAdminClient();
    const [brandsRes, accountsRes, cfgRes] = await Promise.all([
      db.from("social_brands" as never).select("id, code, label, sort_order").order("sort_order"),
      db.from("social_accounts" as never).select("id, brand_id").eq("is_active", true),
      db.from("social_scorecard_config" as never).select("*").order("effective_from", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    for (const r of [brandsRes, accountsRes, cfgRes]) if (r.error) return fail(r.error.message);
    const accounts = (accountsRes.data ?? []) as any[];
    const cfgRows = (cfgRes.data ?? []) as unknown as ConfigRow[];
    // Target omset brand Haengbocake mengikuti target omzet cabang (lihat computeSocialScorecard).
    const branchOmzet = new Map<string, number>();
    {
      const tr = await db.from("scorecard_branch_targets" as never).select("branch, monthly_pos_target, monthly_cake_target");
      for (const t of (tr.data ?? []) as unknown as { branch: string; monthly_pos_target: string | number | null; monthly_cake_target: string | number | null }[]) {
        const sum = (Number(t.monthly_pos_target) || 0) + (Number(t.monthly_cake_target) || 0);
        if (sum > 0) branchOmzet.set(t.branch, sum);
      }
    }
    const brands: SocialBrandCard[] = ((brandsRes.data ?? []) as any[]).map((b) => {
      const versions = cfgRows.filter((c) => c.brand_id === b.id).map(toVersion);
      const spec = BRAND_REVENUE[b.code];
      return {
        brandId: b.id,
        code: b.code,
        label: b.label,
        accountsReporting: 0,
        accountCount: accounts.filter((a) => a.brand_id === b.id).length,
        weeksReported: 0,
        metrics: SOCIAL_METRICS.map((def) => {
          const cfg = pickConfig(versions.filter((v) => v.metricCode === def.code), month);
          const fromBranch = def.code === "omset" && spec?.kind === "haeng" && branchOmzet.has(spec.branch);
          return {
            code: def.code,
            actual: null,
            target: fromBranch ? branchOmzet.get((spec as { branch: string }).branch)! : (cfg?.targetValue ?? null),
            score: null,
            status: "not_assessed" as const,
            label: def.label,
            kind: def.kind,
            note: def.note,
            greenBound: cfg?.greenBound ?? null,
            redBound: cfg?.redBound ?? null,
            spark: [],
            inputs: fromBranch ? { target_sumber: "cabang" } : {},
          };
        }),
        history: cfgRows
          .filter((c) => c.brand_id === b.id)
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
      };
    });
    return { ok: true, data: { month, brands } };
  } catch (e) {
    return fail(errMsg(e));
  }
}

// ───────────────────────────── Penulisan ─────────────────────────────

export interface ConfigInput {
  brandId: string;
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
  if (!input.brandId) return fail("Brand wajib dipilih");
  if (!SOCIAL_METRIC_BY_CODE.has(input.metricCode)) return fail("Metrik tidak dikenal");
  if (!isMonthIso(input.effectiveFrom)) return fail("Bulan berlaku tidak valid");
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 5) return fail("Alasan perubahan wajib diisi (minimal 5 karakter)");
  if (![input.greenBound, input.redBound].every((n) => Number.isFinite(n) && n >= 0 && n <= 1000)) return fail("Batas hijau/merah tidak valid");
  if (input.greenBound < input.redBound) return fail("Batas hijau tidak boleh lebih kecil dari batas merah");
  if (input.targetValue != null && !(Number.isFinite(input.targetValue) && input.targetValue >= 0)) return fail("Target tidak valid");

  const db = createAdminClient();
  const { error } = await db.from("social_scorecard_config" as never).insert({
    brand_id: input.brandId,
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
  revalidatePath("/admin/social");
  return { ok: true };
}
