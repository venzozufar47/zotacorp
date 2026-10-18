"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "./_supabase-admin";
import { requireAdmin } from "./_gates";
import { getCurrentUser } from "@/lib/supabase/cached";
import { sendPushToUser } from "@/lib/push/web-push";
import { fetchPnL } from "@/lib/cashflow/pnl";
import { computeMetricsAsOf, type ScorecardBranch } from "./scorecard.actions";
import { hasActiveSpInMonth } from "./cleaning-review.actions";
import { findPosAccount } from "./pos.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";

/**
 * Kalkulator Bonus Tim (PRD-10) — Perjanjian Kerja Lampiran C.
 *
 * LK_aktual (laba kotor) pakai `fetchPnL` — DEFINISI GROSS PROFIT YANG
 * SAMA dengan dashboard investor (lib/investor/dashboard.ts), bukan
 * dihitung ulang dengan cara berbeda yang bisa menyimpang dari situ.
 *
 * Pengali scorecard pakai `computeMetricsAsOf` dengan asOf = HARI
 * TERAKHIR bulan yang dibayar (bukan hari ini) — jadi skornya memang
 * mencerminkan performa bulan itu, konsisten dipanggil kapan pun bonus
 * dihitung.
 *
 * Eligibilitas "tidak ada tidak-hadir-tanpa-kabar" SENGAJA TIDAK otomatis
 * — belum ada sumber data yang membedakan absen-berizin vs mangkir tanpa
 * rekonsiliasi jadwal penuh (di luar cakupan PRD ini). Admin
 * mengecualikan orang secara manual dengan alasan; SP aktif TETAP dicek
 * otomatis lewat `hasActiveSpInMonth` (SP aktif kapan pun sepanjang
 * bulan yang dibayar, bukan cuma hari ini).
 *
 * `bonus_*` belum di generated `Database` type — pola `db(): any` sama
 * dengan modul PRD lain sesi ini.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
function db(): any {
  return createAdminClient();
}

const COGS_CATEGORY = "Cost of Goods Sold";

function currentQuarter(): string {
  const [y, m] = jakartaDateString(new Date()).split("-").map(Number);
  return `${y}-Q${Math.ceil(m / 3)}`;
}

function scorecardPoints(band: string): number {
  if (band === "red") return 0;
  if (band === "yellow") return 0.5;
  return 1; // green, measuring, unset — manfaat keraguan ke tim
}

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

/** Jam hadir (checked_in → checked_out) satu karyawan dalam [startIso, endIso). */
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

export interface BonusParameters {
  branch: ScorecardBranch;
  quarter: string;
  p: number;
  lkDasar: number;
  locked: boolean;
}

export async function getBonusParameters(
  branch: ScorecardBranch,
  quarter?: string
): Promise<BonusParameters | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return null;
  const q = quarter ?? currentQuarter();
  const { data } = await db()
    .from("bonus_parameters")
    .select("*")
    .eq("branch", branch)
    .eq("quarter", q)
    .maybeSingle();
  if (!data) return null;
  const [qYear, qNum] = q.split("-Q").map(Number);
  const quarterMonths = [1, 2, 3]
    .map((i) => (qNum - 1) * 3 + i)
    .map((mo) => `${qYear}-${String(mo).padStart(2, "0")}`);
  const { count } = await db()
    .from("bonus_runs")
    .select("id", { count: "exact", head: true })
    .eq("branch", branch)
    .eq("status", "finalized")
    .in("period", quarterMonths);
  return { branch, quarter: q, p: data.p, lkDasar: data.lk_dasar, locked: (count ?? 0) > 0 };
}

export async function setBonusParameters(input: {
  branch: ScorecardBranch;
  quarter?: string;
  p: number;
  lkDasar: number;
}): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const quarter = input.quarter ?? currentQuarter();
  const existing = await getBonusParameters(input.branch, quarter);
  if (existing?.locked) {
    return { ok: false, error: "Sudah ada bonus final kuartal ini — parameter tidak bisa diubah." };
  }
  const { error } = await db()
    .from("bonus_parameters")
    .upsert(
      { branch: input.branch, quarter, p: input.p, lk_dasar: input.lkDasar, set_by: gate.userId },
      { onConflict: "branch,quarter" }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/bonus");
  return { ok: true };
}

export async function listActiveEmployeesForBonus(): Promise<{ id: string; name: string }[]> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name")
    .eq("business_unit", "Haengbocake")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name }));
}

export interface BonusSharePreview {
  userId: string;
  name: string;
  hours: number;
  share: number;
  excluded: boolean;
  excludedReason: string | null;
}

export interface BonusPreview {
  branch: ScorecardBranch;
  period: string;
  grossProfit: number;
  lkDasar: number;
  p: number;
  scorecardMultiplier: number;
  pool: number;
  shares: BonusSharePreview[];
}

/** Pratinjau — TIDAK disimpan. Admin menyimpan via `saveBonusRun` setelah puas. */
export async function computeBonusPreview(input: {
  branch: ScorecardBranch;
  period: string; // 'YYYY-MM'
  employeeUserIds: string[];
  manualExclusions?: Record<string, string>; // userId -> alasan
}): Promise<ActionResult<BonusPreview>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const [year, month] = input.period.split("-").map(Number);
  const quarter = `${year}-Q${Math.ceil(month / 3)}`;
  const params = await getBonusParameters(input.branch, quarter);
  if (!params) return { ok: false, error: "Parameter bonus (p, LK dasar) belum diatur kuartal ini" };

  const admin = createAdminClient();
  const posAccount = await findPosAccount(input.branch);
  if (!posAccount) return { ok: false, error: "Rekening POS cabang ini tidak ditemukan" };
  const { data: bankAccount } = await admin
    .from("bank_accounts")
    .select("daily_revenue_target")
    .eq("id", posAccount.id)
    .maybeSingle();

  const startIso = `${input.period}-01T00:00:00+07:00`;
  const endMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const endIso = `${endMonth}-01T00:00:00+07:00`;
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const asOf = `${input.period}-${String(lastDayOfMonth).padStart(2, "0")}`;

  const [report, metrics] = await Promise.all([
    fetchPnL(admin, "Haengbocake", { year, month }, { year, month }),
    computeMetricsAsOf(input.branch, posAccount.id, bankAccount?.daily_revenue_target ?? null, asOf),
  ]);
  const m = report.months[0];
  const branchPnl = m?.byBranch[input.branch];
  if (!branchPnl) return { ok: false, error: "Data PnL bulan ini belum ada" };
  const cogs = branchPnl.byCategory.find((c) => c.category === COGS_CATEGORY)?.debit ?? 0;
  const grossProfit = branchPnl.operatingRevenue - cogs;

  const points = metrics.reduce((s, mt) => s + scorecardPoints(mt.band), 0);
  const multiplier = points / 4;
  const pool = (params.p / 100) * Math.max(0, grossProfit - params.lkDasar) * multiplier;

  const names = await namesFor(input.employeeUserIds);
  const hoursByUser = new Map<string, number>();
  await Promise.all(
    input.employeeUserIds.map(async (uid) => {
      hoursByUser.set(uid, await hoursWorked(uid, startIso, endIso));
    })
  );

  const exclusions = input.manualExclusions ?? {};
  const eligible: { userId: string; hours: number }[] = [];
  const shares: BonusSharePreview[] = [];
  for (const uid of input.employeeUserIds) {
    const hours = hoursByUser.get(uid) ?? 0;
    const spActive = await hasActiveSpInMonth(uid, startIso.slice(0, 10), asOf);
    const manualReason = exclusions[uid];
    const excluded = spActive || !!manualReason;
    const excludedReason = spActive ? "SP aktif" : manualReason ?? null;
    if (!excluded) eligible.push({ userId: uid, hours });
    shares.push({ userId: uid, name: names.get(uid) ?? "—", hours, share: 0, excluded, excludedReason });
  }
  const totalHours = eligible.reduce((s, e) => s + e.hours, 0);
  for (const s of shares) {
    if (s.excluded || totalHours <= 0) continue;
    s.share = pool * (s.hours / totalHours);
  }

  return {
    ok: true,
    data: {
      branch: input.branch,
      period: input.period,
      grossProfit,
      lkDasar: params.lkDasar,
      p: params.p,
      scorecardMultiplier: multiplier,
      pool,
      shares,
    },
  };
}

export async function saveBonusRun(preview: BonusPreview): Promise<ActionResult<{ runId: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const { data: run, error } = await db()
    .from("bonus_runs")
    .upsert(
      {
        branch: preview.branch,
        period: preview.period,
        gross_profit: preview.grossProfit,
        lk_dasar: preview.lkDasar,
        p: preview.p,
        scorecard_multiplier: preview.scorecardMultiplier,
        pool: preview.pool,
        status: "draft",
        created_by: gate.userId,
      },
      { onConflict: "branch,period" }
    )
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const runId = (run as { id: string }).id;

  await db().from("bonus_run_shares").delete().eq("run_id", runId);
  if (preview.shares.length > 0) {
    const { error: sharesErr } = await db().from("bonus_run_shares").insert(
      preview.shares.map((s) => ({
        run_id: runId,
        user_id: s.userId,
        hours: s.hours,
        share: s.share,
        excluded: s.excluded,
        excluded_reason: s.excludedReason,
      }))
    );
    if (sharesErr) return { ok: false, error: sharesErr.message };
  }

  revalidatePath("/admin/bonus");
  return { ok: true, data: { runId } };
}

export async function finalizeBonusRun(runId: string): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const { error } = await db()
    .from("bonus_runs")
    .update({ status: "finalized", finalized_by: gate.userId, finalized_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };

  const { data: shares } = await db()
    .from("bonus_run_shares")
    .select("user_id, share, excluded")
    .eq("run_id", runId)
    .eq("excluded", false);
  await Promise.all(
    (shares ?? []).map((s: { user_id: string; share: number }) =>
      sendPushToUser(s.user_id, {
        title: "Bonus bulan ini sudah terbit",
        body: `Bagianmu Rp${Math.round(s.share).toLocaleString("id-ID")} — lihat rinciannya di app.`,
        url: "/bonus",
      })
    )
  );

  revalidatePath("/admin/bonus");
  return { ok: true };
}

export interface BonusRunView extends BonusPreview {
  id: string;
  status: "draft" | "finalized";
}

export async function getBonusRun(branch: ScorecardBranch, period: string): Promise<BonusRunView | null> {
  const gate = await requireAdmin();
  if (!gate.ok) return null;
  const { data: run } = await db()
    .from("bonus_runs")
    .select("*")
    .eq("branch", branch)
    .eq("period", period)
    .maybeSingle();
  if (!run) return null;
  const { data: sharesData } = await db()
    .from("bonus_run_shares")
    .select("user_id, hours, share, excluded, excluded_reason")
    .eq("run_id", run.id);
  const names = await namesFor((sharesData ?? []).map((s: { user_id: string }) => s.user_id));
  return {
    id: run.id,
    status: run.status,
    branch,
    period,
    grossProfit: run.gross_profit,
    lkDasar: run.lk_dasar,
    p: run.p,
    scorecardMultiplier: run.scorecard_multiplier,
    pool: run.pool,
    shares: (sharesData ?? []).map((s: any) => ({
      userId: s.user_id,
      name: names.get(s.user_id) ?? "—",
      hours: s.hours,
      share: s.share,
      excluded: s.excluded,
      excludedReason: s.excluded_reason,
    })),
  };
}

/** Transparansi: siapa pun bisa lihat rincian bonusnya sendiri dan cara hitungnya. */
export async function listMyBonusShares(): Promise<
  (BonusSharePreview & { period: string; branch: ScorecardBranch; pool: number; grossProfit: number; lkDasar: number; p: number; scorecardMultiplier: number })[]
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
