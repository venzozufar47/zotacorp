"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireSocialAdmin, type ActionResult } from "./_gates";
import { REVENUE_CATEGORIES, usesPosRegime } from "@/lib/unit-scorecard/finance";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { sumCakeRevenue } from "@/lib/scorecard/cake-revenue";
import { addDays, dm } from "@/lib/social/week-label";
import { getCurrentUser } from "@/lib/supabase/cached";
import { editorBrandIds } from "@/lib/social/access";
import {
  SOCIAL_METRICS,
  SOCIAL_METRIC_BY_CODE,
  engagementOf,
  followersGrowthOf,
  lastMonths,
  mondayOf,
  monthRange,
  pickConfig,
  reachOf,
  scoreMetric,
  type ConfigVersion,
  type ReportRow,
  type ScoredMetric,
  type SocialMetricCode,
} from "@/lib/social/scorecard";

/**
 * Scorecard Sosmed per brand (haengbo.corner → omset POS, haengbocake.idn → omset Custom Cake, keduanya Pare + Semarang;
 * yeobospace.id → Yeobo Space).
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
const TREND_MONTHS = 6;

/** Sumber omset tiap brand: haengbo.corner = omset POS, haengbocake.idn = omset Custom Cake (Pare + Semarang), yeobospace.id = laba-rugi Yeobo. */
const BRAND_REVENUE: Record<string, { kind: "pos" | "cake" | "yeobo" }> = {
  haengbocake_idn: { kind: "cake" },
  haengbo_corner: { kind: "pos" },
  yeobospace_id: { kind: "yeobo" },
};
const HAENG_BRANCHES = ["Pare", "Semarang"] as const;

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
  /** Tampilan karyawan: nilai ditampilkan sebagai % pencapaian terhadap target (angka rupiah aktual tidak dikirim). */
  valueAsScore?: boolean;
  /** Tampilan karyawan: nominal target tidak dikirim/ditampilkan (hanya % pencapaian). */
  targetHidden?: boolean;
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

interface RevenueResult {
  total: number;
  parts: { cabang: string; rp: number }[];
}

/** Konversi target bulanan ke 28 hari (4 minggu): 28 ÷ (365/12). */
const WINDOW_SCALE = 28 / (365 / 12);
const jt = (n: number) => `Rp${(n / 1_000_000).toFixed(1).replace(".", ",")} jt`;

/**
 * Omset POS atau Custom Cake brand Haengbocake = jumlah Pare + Semarang pada [start, end] (inklusif), angka yang sama
 * dengan Scorecard Cabang. Sebelum Mei 2026 POS dan cake tidak terpisah di laporan → null.
 */
async function haengRevenue(db: Db, start: string, end: string, kind: "pos" | "cake"): Promise<RevenueResult | null> {
  if (!usesPosRegime(start)) return null;
  const parts = await Promise.all(
    HAENG_BRANCHES.map(async (cabang) => {
      if (kind === "cake") return { cabang: cabang as string, rp: Math.round(await sumCakeRevenue(db, cabang, start, end)) };
      const r = await db.rpc("scorecard_pos_total" as never, { p_pos_branch: cabang, p_from: start, p_to: end } as never);
      if (r.error) throw new Error(r.error.message);
      return { cabang: cabang as string, rp: Math.round(num(r.data)) };
    })
  );
  return { total: parts.reduce((s, p) => s + p.rp, 0), parts };
}

interface RevenueRow {
  date: string;
  amount: number;
}

/** Omset Yeobo (semua cabang) pada [start, end] dari buku kas, menurut TANGGAL transaksi. Sebelum 2026 tidak ada data kas → null. */
function yeoboWindowRevenue(rows: RevenueRow[], start: string, end: string): RevenueResult | null {
  if (start < "2026-01-01") return null;
  let total = 0;
  for (const r of rows) if (r.date >= start && r.date <= end) total += r.amount;
  return { total, parts: [] };
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
  /** Tampilan karyawan: omset hanya sebagai % terhadap target (tanpa rupiah, tren, rincian cabang) dan tanpa riwayat target. */
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
      db.from("social_weekly_reports" as never).select("*").gte("week_start", addDays(first, -28)).lt("week_start", monthRange(month).toExcl),
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

    const needsHaeng = brands.some((b) => BRAND_REVENUE[b.code]?.kind === "pos" || BRAND_REVENUE[b.code]?.kind === "cake");
    const needsYeobo = brands.some((b) => BRAND_REVENUE[b.code]?.kind === "yeobo");

    // Target omset brand Haengbocake = target omzet cabang di Scorecard Cabang (bulanan), dijumlah Pare + Semarang (haengbo.corner =
    // target POS, haengbocake.idn = target Custom Cake) lalu dikonversi ke 28 hari: SATU sumber, supaya angka target tidak bisa
    // berbeda antara dua scorecard. Brand tanpa target cabang (Yeobo) memakai target sosmed sendiri (sudah per 4 minggu).
    const branchTarget = { pos: 0, cake: 0 };
    if (needsHaeng) {
      const tr = await db.from("scorecard_branch_targets" as never).select("branch, monthly_pos_target, monthly_cake_target");
      for (const t of (tr.data ?? []) as unknown as { monthly_pos_target: string | number | null; monthly_cake_target: string | number | null }[]) {
        branchTarget.pos += Number(t.monthly_pos_target) || 0;
        branchTarget.cake += Number(t.monthly_cake_target) || 0;
      }
      branchTarget.pos *= WINDOW_SCALE;
      branchTarget.cake *= WINDOW_SCALE;
    }

    const monthInProgress = month === `${today.slice(0, 7)}-01`;

    // Semua metrik dihitung dari 4 MINGGU (28 hari) yang berakhir di bulan itu (Senin terakhir yang sudah selesai di dalam bulan
    // itu), dan targetnya PER 4 MINGGU. Tiap bulan selalu 4 minggu (bukan 4 atau 5 menurut jumlah Senin), jadi satu target
    // berlaku untuk semua bulan dan tampilan tidak kosong di awal bulan.
    const latestWeek = addDays(mondayOf(today), -7);
    const windowFor = (m: string) => {
      let end = mondayOf(addDays(monthRange(m).toExcl, -1));
      if (end > latestWeek) end = latestWeek;
      return { start: addDays(end, -21), end };
    };
    const inWindow = (rs: (ReportRow & { brandId: string })[], m: string) => {
      const w = windowFor(m);
      return rs.filter((r) => r.weekStart >= w.start && r.weekStart <= w.end);
    };
    /** Rentang tanggal omset: Senin pertama s.d. Minggu penutup jendela laporan. */
    const omsetWindow = (m: string) => {
      const w = windowFor(m);
      return { start: w.start, end: addDays(w.end, 6) };
    };

    // Omset Yeobo dari buku kas (pendapatan menurut tanggal transaksi), dimuat sekali untuk seluruh rentang tren. Data Mayar
    // tidak selalu sampai hari ini: jendela bulan berjalan berakhir di tanggal pendapatan terakhir yang masuk.
    let yeoboDataUntil: string | null = null;
    const yeoboRows: RevenueRow[] = [];
    if (needsYeobo) {
      const rangeStart = addDays(omsetWindow(months[0]).start, -7);
      const rangeEnd = omsetWindow(month).end;
      const PAGE = 1000;
      for (let offset = 0; ; offset += PAGE) {
        const r = await db
          .from("cashflow_transactions" as never)
          .select("id, transaction_date, credit, debit, category, cashflow_statements!inner(bank_accounts!inner(business_unit))")
          .eq("cashflow_statements.bank_accounts.business_unit", "Yeobo Space")
          .in("category", [...REVENUE_CATEGORIES])
          .gte("transaction_date", rangeStart)
          .lte("transaction_date", rangeEnd)
          .order("id", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (r.error) return fail(r.error.message);
        const rows = (r.data ?? []) as unknown as { transaction_date: string; credit: string | number; debit: string | number }[];
        for (const t of rows) {
          const amount = num(t.credit) - num(t.debit);
          yeoboRows.push({ date: t.transaction_date, amount });
          if (num(t.credit) > 0 && (!yeoboDataUntil || t.transaction_date > yeoboDataUntil)) yeoboDataUntil = t.transaction_date;
        }
        if (rows.length < PAGE) break;
      }
    }

    const out: SocialBrandCard[] = [];
    for (const b of brands) {
      const brandAccounts = accounts.filter((a) => a.brand_id === b.id).map((a) => a.id as string);
      const brandReports = reports.filter((r) => r.brandId === b.id);
      const versions = cfgRows.filter((c) => c.brand_id === b.id).map(toVersion);
      const cfgFor = (code: SocialMetricCode, m: string) => pickConfig(versions.filter((v) => v.metricCode === code), m);

      const spec = BRAND_REVENUE[b.code];
      // Jendela omset: Senin–Minggu. Untuk Yeobo bulan berjalan, geser agar berakhir di tanggal data kas terakhir bila lebih awal.
      const omsetRange = (m: string) => {
        const base = omsetWindow(m);
        if (spec?.kind === "yeobo" && m === month && monthInProgress && yeoboDataUntil && yeoboDataUntil < base.end) {
          return { start: addDays(yeoboDataUntil, -27), end: yeoboDataUntil };
        }
        return base;
      };
      const revenueOf = async (m: string): Promise<RevenueResult | null> => {
        if (!spec) return null;
        const r = omsetRange(m);
        if (spec.kind === "yeobo") return yeoboWindowRevenue(yeoboRows, r.start, r.end);
        return haengRevenue(db, r.start, r.end, spec.kind);
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
        const rs = inWindow(brandReports, m);
        return {
          reach: reachOf(rs),
          omset: revenues[i]?.total ?? null,
          followers_growth: followersGrowthOf(rs),
          engagement: engagementOf(rs),
        } satisfies Record<SocialMetricCode, number | null>;
      });
      const curRevenue = revenues[revenues.length - 1];
      const curReports = inWindow(brandReports, month);
      const curWindow = windowFor(month);
      const cur = valuesByMonth[valuesByMonth.length - 1];
      const accountsReporting = new Set(curReports.map((r) => r.accountId)).size;
      const weeksReported = new Set(curReports.map((r) => r.weekStart)).size;

      const metrics: BrandMetricView[] = SOCIAL_METRICS.map((def) => {
        let cfg = cfgFor(def.code, month);
        const hk = spec?.kind;
        if (def.code === "omset" && (hk === "pos" || hk === "cake") && branchTarget[hk] > 0) {
          cfg = {
            metricCode: "omset",
            targetValue: branchTarget[hk],
            greenBound: cfg?.greenBound ?? 100,
            redBound: cfg?.redBound ?? 70,
            effectiveFrom: cfg?.effectiveFrom ?? month,
            createdAt: cfg?.createdAt ?? "",
          };
        }
        const scored = scoreMetric(cur[def.code], cfg, def.code);
        // Keterangan tambahan untuk ikon ⓘ: padat, satu baris per butir.
        const infoLines: string[] = [];
        if (def.code === "omset") {
          const r = omsetRange(month);
          infoLines.push(`28 hari: ${dm(r.start)} – ${dm(r.end)}`);
          if (!opts.employeeView && curRevenue && curRevenue.parts.length > 0) infoLines.push(curRevenue.parts.map((x) => `${x.cabang} ${jt(x.rp)}`).join(" · "));
        } else {
          infoLines.push(`4 minggu: ${dm(curWindow.start)} – ${dm(addDays(curWindow.end, 6))}`);
          if (weeksReported < 4) infoLines.push(`Baru ${weeksReported} dari 4 minggu terisi`);
        }
        const inputs: Record<string, unknown> =
          def.code === "omset"
            ? revFail.msg
              ? { catatan: `Omset belum bisa dihitung: ${revFail.msg}` }
              : {
                  sumber:
                    spec?.kind === "yeobo"
                      ? "Buku kas Yeobo Space (semua cabang)"
                      : spec?.kind === "cake"
                        ? "Omset Custom Cake (Pare + Semarang)"
                        : "Omset POS (Pare + Semarang)",
                }
            : { minggu_terisi: weeksReported, akun_terisi: `${accountsReporting}/${brandAccounts.length}` };
        // Karyawan hanya melihat omset sebagai % terhadap target: angka rupiah aktual, tren, dan rincian per cabang tidak dikirim.
        const hideRupiah = opts.employeeView && def.code === "omset";
        return {
          ...scored,
          ...(hideRupiah ? { actual: null, valueAsScore: true } : {}),
          // Nominal target omset juga tidak ditampilkan ke karyawan, untuk semua brand (hanya % pencapaian).
          ...(hideRupiah ? { target: null, targetHidden: true } : {}),
          label: def.label,
          kind: def.kind,
          note: def.note,
          greenBound: cfg?.greenBound ?? null,
          redBound: cfg?.redBound ?? null,
          spark: hideRupiah ? [] : valuesByMonth.map((v) => v[def.code]),
          inputs: { ...inputs, ...(infoLines.length > 0 ? { info_lines: infoLines } : {}) },
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
    return { ok: true, data: { month, monthLabel: opts.employeeView ? "28 hari terakhir" : monthLabel(month), trendMonths: months, brands: out } };
  } catch (e) {
    return fail(errMsg(e));
  }
}

/**
 * Scorecard sosmed untuk BERANDA pengisi laporan: hanya brand yang ia pegang (`social_report_editors`), omset hanya
 * sebagai % terhadap target (tanpa angka rupiah) dan tanpa riwayat target. null = bukan pengisi. `simulateBrandCode` hanya berlaku di luar produksi, untuk meninjau
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
    // Target omset brand Haengbocake mengikuti target omzet cabang, dijumlah Pare + Semarang (lihat computeSocialScorecard).
    const branchTarget = { pos: 0, cake: 0 };
    {
      const tr = await db.from("scorecard_branch_targets" as never).select("branch, monthly_pos_target, monthly_cake_target");
      for (const t of (tr.data ?? []) as unknown as { monthly_pos_target: string | number | null; monthly_cake_target: string | number | null }[]) {
        branchTarget.pos += Number(t.monthly_pos_target) || 0;
        branchTarget.cake += Number(t.monthly_cake_target) || 0;
      }
    }
    branchTarget.pos *= WINDOW_SCALE;
    branchTarget.cake *= WINDOW_SCALE;
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
          const hk = spec?.kind;
          const fromBranch = def.code === "omset" && (hk === "pos" || hk === "cake") && branchTarget[hk] > 0;
          return {
            code: def.code,
            actual: null,
            target: fromBranch ? branchTarget[hk as "pos" | "cake"] : (cfg?.targetValue ?? null),
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
