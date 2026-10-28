"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin } from "./_gates";
import { getCurrentUser } from "@/lib/supabase/cached";
import { sendPushToUser } from "@/lib/push/web-push";
import { fetchPnL, type PnLReport } from "@/lib/cashflow/pnl";
import { classifyCategories, usesPosRegime } from "@/lib/unit-scorecard/finance";
import { computeMetricsAsOf, type ScorecardBranch } from "./scorecard.actions";
import { hasActiveSpInMonth } from "./cleaning-review.actions";
import { findPosAccount } from "./pos.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { sumCakeRevenue } from "@/lib/scorecard/cake-revenue";
import { bonusPool, distributeShares, scorecardPoints } from "@/lib/bonus/logic";
import { isValidPeriod, isValidQuarter, lastDayOf, monthsOfQuarter, nextMonthStart, quarterOf, shiftQuarter } from "@/lib/bonus/periods";

/**
 * Kalkulator Bonus Tim (PRD-10) — Perjanjian Kerja Lampiran C.
 *
 *   kolam = p% × max(0, LK aktual − LK dasar) × (poin scorecard / 4), dibagi SAMA RATA ke penerima yang berhak
 *
 * Penerima TETAP per cabang (`bonus_recipients`: koordinator toko & kepala produksi). Perhitungan otomatis untuk bulan
 * mana pun; owner hanya menentukan p dan LK dasar per kuartal dan (opsional) menerbitkan bulan yang sudah selesai.
 *
 * LK aktual memakai definisi omzet yang SAMA dengan Scorecard Unit & target omzet cabang: sejak Mei 2026 omzet = POS +
 * Custom Cake + Other Revenue (laba-rugi saja tidak memuat Custom Cake), sebelumnya laporan laba-rugi. HPP = pembelian
 * bahan (Cost of Goods Sold) di buku kas. Rincian ini dibekukan di `bonus_runs.breakdown` saat terbit supaya slip gaji
 * bisa menampilkannya transparan.
 *
 * Pengali scorecard = poin empat metrik kartu Scorecard Cabang (`computeMetricsAsOf` mode "month") pada hari terakhir
 * bulan (atau hari ini untuk bulan berjalan): waste & service level 30 hari terakhir, omzet terhadap target bulanan, keluhan.
 * Eligibilitas "tidak ada tidak-hadir-tanpa-kabar" SENGAJA TIDAK otomatis (belum ada sumber data mangkir vs izin);
 * SP aktif sepanjang bulan dan akun nonaktif dikecualikan otomatis.
 *
 * `bonus_*` belum di generated `Database` type — pola `db(): any`.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
const BONUS_BRANCHES: ScorecardBranch[] = ["Pare", "Semarang"];

async function hoursWorked(userId: string, startIso: string, endIso: string): Promise<number> {
  const { data } = await createAdminClient()
    .from("attendance_logs")
    .select("checked_in_at, checked_out_at")
    .eq("user_id", userId)
    .gte("checked_in_at", startIso)
    .lt("checked_in_at", endIso)
    .not("checked_out_at", "is", null);
  let totalMs = 0;
  for (const r of data ?? []) {
    if (!r.checked_out_at) continue;
    totalMs += new Date(r.checked_out_at).getTime() - new Date(r.checked_in_at).getTime();
  }
  return totalMs / 3_600_000;
}

// ─── Tipe tampilan ───────────────────────────────────────────────────────────

export interface BonusParams {
  p: number;
  lkDasar: number;
  /** Terkunci bila sudah ada bonus terbit di kuartal ini. */
  locked: boolean;
}

export interface BonusQuarterView {
  quarter: string;
  params: Record<ScorecardBranch, BonusParams | null>;
  /** Parameter kuartal sebelumnya (untuk "salin"), tanpa status kunci. */
  previous: Record<ScorecardBranch, { p: number; lkDasar: number } | null>;
  /** Bulan di kuartal ini yang bonusnya sudah terbit (semua cabang berparameter). */
  publishedPeriods: string[];
  /** Kuartal lain yang parameternya lengkap, untuk simulasi "andai parameter ini dipakai di kuartal ini" (terbaru dulu). */
  simulationSources: { quarter: string; params: Record<ScorecardBranch, { p: number; lkDasar: number }> }[];
}

export interface BonusMetricView {
  key: string;
  label: string;
  displayValue: string;
  band: string;
  points: number;
}

export interface BonusBreakdown {
  regime: "pos_cake" | "laba_rugi";
  revenue: { pos: number; cake: number; other: number; total: number };
  cogs: number;
  grossProfit: number;
  metrics: BonusMetricView[];
  /** Tanggal terakhir data yang dihitung ("YYYY-MM-DD"). */
  asOf: string;
}

export interface BonusShareView {
  userId: string;
  name: string;
  label: string;
  hours: number;
  share: number;
  /** Porsi dari kolam (0–1); sama rata di antara penerima yang berhak. */
  fraction: number;
  excluded: boolean;
  excludedReason: string | null;
}

export interface BranchBonusView {
  branch: ScorecardBranch;
  params: { p: number; lkDasar: number } | null;
  breakdown: BonusBreakdown;
  surplus: number;
  multiplier: number;
  pool: number;
  shares: BonusShareView[];
  /** Angka dari bonus yang sudah terbit (dibekukan), bukan hitungan hidup. */
  frozen: boolean;
  runStatus: "draft" | "finalized" | null;
  notes: string[];
  error: string | null;
}

export interface BonusMonthView {
  period: string;
  quarter: string;
  isCurrent: boolean;
  /** Bulan sudah berakhir sehingga boleh diterbitkan. */
  canPublish: boolean;
  /** Kuartal sumber parameter bila ini SIMULASI (hanya tampilan: tidak tersimpan, tidak bisa diterbitkan). */
  simulation: string | null;
  branches: BranchBonusView[];
}

// ─── Parameter per kuartal ───────────────────────────────────────────────────

async function loadParams(branch: ScorecardBranch, quarter: string): Promise<BonusParams | null> {
  const { data } = await db().from("bonus_parameters").select("*").eq("branch", branch).eq("quarter", quarter).maybeSingle();
  if (!data) return null;
  const { count } = await db()
    .from("bonus_runs")
    .select("id", { count: "exact", head: true })
    .eq("branch", branch)
    .eq("status", "finalized")
    .in("period", monthsOfQuarter(quarter));
  return { p: num(data.p), lkDasar: num(data.lk_dasar), locked: (count ?? 0) > 0 };
}

export async function getBonusQuarter(quarter: string): Promise<BonusQuarterView | null> {
  const gate = await requireAdmin();
  if (!gate.ok || !isValidQuarter(quarter)) return null;
  const prevQ = shiftQuarter(quarter, -1);
  const [params, previous, runs, allParams] = await Promise.all([
    Promise.all(BONUS_BRANCHES.map((b) => loadParams(b, quarter))),
    Promise.all(
      BONUS_BRANCHES.map(async (b) => {
        const { data } = await db().from("bonus_parameters").select("p, lk_dasar").eq("branch", b).eq("quarter", prevQ).maybeSingle();
        return data ? { p: num(data.p), lkDasar: num(data.lk_dasar) } : null;
      })
    ),
    db().from("bonus_runs").select("branch, period").eq("status", "finalized").in("period", monthsOfQuarter(quarter)),
    db().from("bonus_parameters").select("branch, quarter, p, lk_dasar").neq("quarter", quarter).order("quarter", { ascending: false }),
  ]);
  const byQuarter = new Map<string, Partial<Record<ScorecardBranch, { p: number; lkDasar: number }>>>();
  for (const r of (allParams.data ?? []) as { branch: ScorecardBranch; quarter: string; p: unknown; lk_dasar: unknown }[]) {
    byQuarter.set(r.quarter, { ...byQuarter.get(r.quarter), [r.branch]: { p: num(r.p), lkDasar: num(r.lk_dasar) } });
  }
  const simulationSources = [...byQuarter]
    .filter(([, v]) => BONUS_BRANCHES.every((b) => v[b]))
    .slice(0, 4)
    .map(([q, v]) => ({ quarter: q, params: { Pare: v.Pare!, Semarang: v.Semarang! } }));
  const byPeriod = new Map<string, Set<string>>();
  for (const r of (runs.data ?? []) as { branch: string; period: string }[]) {
    byPeriod.set(r.period, (byPeriod.get(r.period) ?? new Set()).add(r.branch));
  }
  return {
    quarter,
    params: { Pare: params[0], Semarang: params[1] },
    previous: { Pare: previous[0], Semarang: previous[1] },
    publishedPeriods: [...byPeriod].filter(([, s]) => BONUS_BRANCHES.every((b) => s.has(b))).map(([p]) => p),
    simulationSources,
  };
}

export async function setBonusParameters(input: {
  branch: ScorecardBranch;
  quarter: string;
  p: number;
  lkDasar: number;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!BONUS_BRANCHES.includes(input.branch)) return { ok: false, error: "Cabang tidak valid" };
  if (!isValidQuarter(input.quarter)) return { ok: false, error: "Kuartal tidak valid" };
  if (!Number.isFinite(input.p) || input.p < 0 || input.p > 100) return { ok: false, error: "p harus antara 0 dan 100 (%)" };
  if (!Number.isInteger(input.lkDasar) || input.lkDasar < 0 || input.lkDasar > 100_000_000_000) {
    return { ok: false, error: "LK dasar harus bilangan bulat rupiah ≥ 0" };
  }
  const existing = await loadParams(input.branch, input.quarter);
  if (existing?.locked) return { ok: false, error: "Sudah ada bonus terbit di kuartal ini — parameter tidak bisa diubah." };
  const { error } = await db()
    .from("bonus_parameters")
    .upsert(
      { branch: input.branch, quarter: input.quarter, p: input.p, lk_dasar: input.lkDasar, set_by: gate.userId },
      { onConflict: "branch,quarter" }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/bonus");
  return { ok: true };
}

// ─── Perhitungan ─────────────────────────────────────────────────────────────

interface Recipient {
  userId: string;
  name: string;
  label: string;
  active: boolean;
}

async function loadRecipients(branch: ScorecardBranch): Promise<Recipient[]> {
  const { data } = await db().from("bonus_recipients").select("user_id, label, sort_order").eq("branch", branch).order("sort_order");
  const rows = (data ?? []) as { user_id: string; label: string }[];
  if (rows.length === 0) return [];
  const { data: profs } = await db()
    .from("profiles")
    .select("id, full_name, nickname, is_active, resigned_at")
    .in("id", rows.map((r) => r.user_id));
  const byId = new Map(((profs ?? []) as any[]).map((p) => [p.id as string, p]));
  return rows.map((r) => {
    const p = byId.get(r.user_id);
    return {
      userId: r.user_id,
      name: (p?.nickname?.trim() || p?.full_name || "—") as string,
      label: r.label,
      active: !!p && p.is_active !== false && !p.resigned_at,
    };
  });
}

function emptyBreakdown(asOf: string, regime: BonusBreakdown["regime"]): BonusBreakdown {
  return { regime, revenue: { pos: 0, cake: 0, other: 0, total: 0 }, cogs: 0, grossProfit: 0, metrics: [], asOf };
}

/** Hitungan hidup satu cabang untuk satu bulan. `report` = laba-rugi Haengbocake bulan itu (dibagi untuk kedua cabang). */
async function computeLive(
  branch: ScorecardBranch,
  period: string,
  today: string,
  report: PnLReport | null,
  params: BonusParams | null
): Promise<BranchBonusView> {
  const first = `${period}-01`;
  const end = lastDayOf(period) < today ? lastDayOf(period) : today;
  const isCurrent = today.slice(0, 7) === period;
  const regime: BonusBreakdown["regime"] = usesPosRegime(first) ? "pos_cake" : "laba_rugi";
  const notes: string[] = [];
  const base: BranchBonusView = {
    branch,
    params: params ? { p: params.p, lkDasar: params.lkDasar } : null,
    breakdown: emptyBreakdown(end, regime),
    surplus: 0,
    multiplier: 0,
    pool: 0,
    shares: [],
    frozen: false,
    runStatus: null,
    notes,
    error: null,
  };

  try {
    const admin = createAdminClient();
    const m = report?.months[0];
    const bp = m?.byBranch[branch];
    if (!bp) notes.push("Data laba-rugi bulan ini belum ada.");
    const fin = classifyCategories((bp?.byCategory ?? []).map((c) => ({ category: c.category, credit: c.credit, debit: c.debit, kind: c.kind })));
    if ((m?.unallocatedCount ?? 0) > 0) notes.push("Alokasi biaya Pusat bulan ini belum lengkap — HPP/omzet cabang bisa kurang dari sebenarnya.");

    let pos = 0;
    let cake = 0;
    let other = 0;
    if (regime === "pos_cake") {
      const r = await admin.rpc("scorecard_pos_total" as never, { p_pos_branch: branch, p_from: first, p_to: end } as never);
      if (r.error) throw new Error(r.error.message);
      pos = num(r.data);
      cake = await sumCakeRevenue(admin, branch, first, end);
      other = fin.otherRevenue;
    } else {
      pos = fin.pnlRevenue;
    }
    const total = pos + cake + other;
    const cogs = fin.cogs;
    const grossProfit = total - cogs;

    // Pengali scorecard.
    const account = await findPosAccount(branch);
    let metrics: BonusMetricView[] = [];
    let multiplier = 1;
    if (account) {
      const { data: bank } = await admin.from("bank_accounts").select("daily_revenue_target").eq("id", account.id).maybeSingle();
      // Pengali mengikuti kartu Scorecard Cabang yang baru: waste & service level 30 hari terakhir, omzet (POS + Custom Cake)
      // terhadap target bulanan, keluhan bulan itu. Target omzet yang dipakai = target yang berlaku sekarang (belum berversi).
      const { data: tr } = await db().from("scorecard_branch_targets").select("monthly_pos_target, monthly_cake_target").eq("branch", branch).maybeSingle();
      const posTarget = tr?.monthly_pos_target == null ? null : Number(tr.monthly_pos_target);
      const cakeTarget = tr?.monthly_cake_target == null ? null : Number(tr.monthly_cake_target);
      const ms = await computeMetricsAsOf(branch, account.id, bank?.daily_revenue_target ?? null, end, "month", { posTarget, cakeTarget });
      metrics = ms.map((x) => ({ key: x.key, label: x.label, displayValue: x.displayValue, band: x.band, points: scorecardPoints(x.band) }));
      multiplier = metrics.reduce((s, x) => s + x.points, 0) / 4;
    } else {
      notes.push("Rekening POS cabang tidak ditemukan — pengali scorecard dianggap penuh.");
    }

    const surplus = params ? Math.max(0, grossProfit - params.lkDasar) : 0;
    const pool = params ? bonusPool(grossProfit, params.lkDasar, params.p, multiplier) : 0;
    if (!params) notes.push("Parameter kuartal belum diisi — kolam belum bisa dihitung.");
    if (isCurrent) notes.push("Bulan berjalan: angka sementara sampai akhir bulan.");

    // Penerima & jam hadir.
    const recipients = await loadRecipients(branch);
    const startIso = `${first}T00:00:00+07:00`;
    const endIso = `${nextMonthStart(period)}T00:00:00+07:00`;
    const detail = await Promise.all(
      recipients.map(async (r) => {
        const hours = await hoursWorked(r.userId, startIso, endIso);
        const sp = await hasActiveSpInMonth(r.userId, first, end);
        const excludedReason = !r.active ? "Tidak aktif" : sp ? "SP aktif" : null;
        return { r, hours, excludedReason };
      })
    );
    const amounts = distributeShares(pool, detail.map((d) => ({ excluded: !!d.excludedReason })));
    const shares: BonusShareView[] = detail.map((d, i) => ({
      userId: d.r.userId,
      name: d.r.name,
      label: d.r.label,
      hours: d.hours,
      share: amounts[i],
      fraction: pool > 0 ? amounts[i] / pool : 0,
      excluded: !!d.excludedReason,
      excludedReason: d.excludedReason,
    }));
    if (recipients.length === 0) notes.push("Belum ada penerima bonus untuk cabang ini.");
    else if (pool > 0 && amounts.every((a) => a === 0)) notes.push("Semua penerima dikecualikan (SP aktif / tidak aktif) — kolam belum bisa dibagi.");

    return {
      ...base,
      breakdown: { regime, revenue: { pos, cake, other, total }, cogs, grossProfit, metrics, asOf: end },
      surplus,
      multiplier,
      pool,
      shares,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Gagal menghitung bonus" };
  }
}

/** Bonus yang sudah terbit: tampilkan angka yang dibekukan, bukan hitung ulang. */
async function loadFrozen(branch: ScorecardBranch, period: string): Promise<BranchBonusView | null> {
  const { data: run } = await db().from("bonus_runs").select("*").eq("branch", branch).eq("period", period).maybeSingle();
  if (!run || run.status !== "finalized") return null;
  const { data: sharesData } = await db()
    .from("bonus_run_shares")
    .select("user_id, hours, share, excluded, excluded_reason")
    .eq("run_id", run.id);
  const recipients = await loadRecipients(branch);
  const labelById = new Map(recipients.map((r) => [r.userId, r]));
  const profIds = ((sharesData ?? []) as any[]).map((s) => s.user_id as string).filter((id) => !labelById.has(id));
  const extra = new Map<string, string>();
  if (profIds.length) {
    const { data: profs } = await db().from("profiles").select("id, full_name, nickname").in("id", profIds);
    for (const p of (profs ?? []) as any[]) extra.set(p.id, (p.nickname?.trim() || p.full_name || "—") as string);
  }
  const pool = num(run.pool);
  const stored = (run.breakdown ?? null) as BonusBreakdown | null;
  const grossProfit = num(run.gross_profit);
  return {
    branch,
    params: { p: num(run.p), lkDasar: num(run.lk_dasar) },
    breakdown: stored ?? { ...emptyBreakdown(lastDayOf(period), usesPosRegime(`${period}-01`) ? "pos_cake" : "laba_rugi"), grossProfit },
    surplus: Math.max(0, grossProfit - num(run.lk_dasar)),
    multiplier: num(run.scorecard_multiplier),
    pool,
    shares: ((sharesData ?? []) as any[]).map((s) => ({
      userId: s.user_id,
      name: labelById.get(s.user_id)?.name ?? extra.get(s.user_id) ?? "—",
      label: labelById.get(s.user_id)?.label ?? "",
      hours: num(s.hours),
      share: num(s.share),
      fraction: pool > 0 ? num(s.share) / pool : 0,
      excluded: !!s.excluded,
      excludedReason: s.excluded_reason ?? null,
    })),
    frozen: true,
    runStatus: "finalized",
    notes: stored ? [] : ["Rincian omzet & HPP tidak tersimpan untuk bonus ini (diterbitkan sebelum rincian dibekukan)."],
    error: null,
  };
}

export async function getBonusMonth(period: string, simulateWithQuarter?: string | null): Promise<BonusMonthView | null> {
  const gate = await requireAdmin();
  if (!gate.ok || !isValidPeriod(period)) return null;
  const today = jakartaDateString(new Date());
  const thisMonth = today.slice(0, 7);
  if (period > thisMonth) return null;
  const quarter = quarterOf(period);
  const [y, mo] = period.split("-").map(Number);

  // Simulasi: pakai parameter kuartal lain, hitung hidup (abaikan bonus yang sudah terbit), tidak ada yang disimpan.
  let simParams: Record<ScorecardBranch, BonusParams> | null = null;
  if (simulateWithQuarter && isValidQuarter(simulateWithQuarter) && simulateWithQuarter !== quarter) {
    const ps = await Promise.all(BONUS_BRANCHES.map((b) => loadParams(b, simulateWithQuarter)));
    if (ps.every(Boolean)) simParams = { Pare: ps[0]!, Semarang: ps[1]! };
  }
  const frozen = await Promise.all(BONUS_BRANCHES.map((b) => (simParams ? Promise.resolve(null) : loadFrozen(b, period))));
  const needLive = frozen.some((f) => !f);
  let report: PnLReport | null = null;
  if (needLive) {
    try {
      report = await fetchPnL(createAdminClient(), "Haengbocake", { year: y, month: mo }, { year: y, month: mo });
    } catch {
      report = null;
    }
  }
  const branches = await Promise.all(
    BONUS_BRANCHES.map(async (b, i) => frozen[i] ?? computeLive(b, period, today, report, simParams ? simParams[b] : await loadParams(b, quarter)))
  );
  return {
    period,
    quarter,
    isCurrent: period === thisMonth,
    canPublish: period < thisMonth && !simParams,
    simulation: simParams ? simulateWithQuarter! : null,
    branches,
  };
}

// ─── Terbitkan ───────────────────────────────────────────────────────────────

/** Bekukan hitungan bulan yang sudah selesai dan umumkan ke penerima. Mengunci parameter kuartalnya. */
export async function publishBonusRun(input: { branch: ScorecardBranch; period: string }): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!BONUS_BRANCHES.includes(input.branch) || !isValidPeriod(input.period)) return { ok: false, error: "Cabang atau bulan tidak valid" };
  const today = jakartaDateString(new Date());
  if (input.period >= today.slice(0, 7)) return { ok: false, error: "Bonus baru bisa diterbitkan setelah bulannya selesai." };

  const existing = await db().from("bonus_runs").select("status").eq("branch", input.branch).eq("period", input.period).maybeSingle();
  if (existing.data?.status === "finalized") return { ok: false, error: "Bonus bulan ini sudah terbit." };

  const params = await loadParams(input.branch, quarterOf(input.period));
  if (!params) return { ok: false, error: "Isi parameter kuartal (p dan LK dasar) dulu." };

  const [y, mo] = input.period.split("-").map(Number);
  const report = await fetchPnL(createAdminClient(), "Haengbocake", { year: y, month: mo }, { year: y, month: mo });
  const v = await computeLive(input.branch, input.period, today, report, params);
  if (v.error) return { ok: false, error: v.error };
  if (v.shares.length === 0) return { ok: false, error: "Belum ada penerima bonus untuk cabang ini." };

  const { data: run, error } = await db()
    .from("bonus_runs")
    .upsert(
      {
        branch: input.branch,
        period: input.period,
        gross_profit: v.breakdown.grossProfit,
        lk_dasar: params.lkDasar,
        p: params.p,
        scorecard_multiplier: v.multiplier,
        pool: v.pool,
        breakdown: v.breakdown,
        status: "finalized",
        created_by: gate.userId,
        finalized_by: gate.userId,
        finalized_at: new Date().toISOString(),
      },
      { onConflict: "branch,period" }
    )
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const runId = (run as { id: string }).id;

  await db().from("bonus_run_shares").delete().eq("run_id", runId);
  const { error: sharesErr } = await db().from("bonus_run_shares").insert(
    v.shares.map((s) => ({
      run_id: runId,
      user_id: s.userId,
      hours: s.hours,
      share: s.share,
      excluded: s.excluded,
      excluded_reason: s.excludedReason,
    }))
  );
  if (sharesErr) return { ok: false, error: sharesErr.message };

  await Promise.all(
    v.shares
      .filter((s) => !s.excluded && s.share > 0)
      .map((s) =>
        sendPushToUser(s.userId, {
          title: "Bonus bulan ini sudah terbit",
          body: `Bagianmu Rp${Math.round(s.share).toLocaleString("id-ID")} — lihat rinciannya di app.`,
          url: "/bonus",
        }).catch((err) => console.error("[bonus] push failed", err))
      )
  );
  revalidatePath("/admin/bonus");
  revalidatePath("/bonus");
  return { ok: true };
}

// ─── Penerima: lihat bonusnya sendiri ────────────────────────────────────────

/** Transparansi: siapa pun bisa lihat rincian bonusnya sendiri dan cara hitungnya. */
export async function listMyBonusShares(): Promise<
  (BonusShareRow & { period: string; branch: ScorecardBranch; pool: number; grossProfit: number; lkDasar: number; p: number; scorecardMultiplier: number })[]
> {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data: shares } = await db()
    .from("bonus_run_shares")
    .select("hours, share, excluded, excluded_reason, bonus_runs!inner(id, branch, period, status, pool, gross_profit, lk_dasar, p, scorecard_multiplier)")
    .eq("user_id", user.id)
    .eq("bonus_runs.status", "finalized");
  return (shares ?? []).map((s: any) => ({
    userId: user.id,
    name: "",
    hours: s.hours,
    share: s.share,
    excluded: s.excluded,
    excludedReason: s.excluded_reason,
    period: s.bonus_runs.period,
    branch: s.bonus_runs.branch,
    pool: s.bonus_runs.pool,
    grossProfit: s.bonus_runs.gross_profit,
    lkDasar: s.bonus_runs.lk_dasar,
    p: s.bonus_runs.p,
    scorecardMultiplier: s.bonus_runs.scorecard_multiplier,
  }));
}

interface BonusShareRow {
  userId: string;
  name: string;
  hours: number;
  share: number;
  excluded: boolean;
  excludedReason: string | null;
}
