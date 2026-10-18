"use server";

import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser, getCurrentRole, getCurrentProfile } from "@/lib/supabase/cached";
import { findPosAccount } from "./pos.actions";
import { getComplaintCount } from "./customer-complaints.actions";
import { WITHDRAWAL_REASON_META, type WithdrawalReason } from "@/lib/pos/withdrawal-reasons";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { resolveUserBranches } from "@/lib/branches/user-branches";

/**
 * Scorecard Cabang (PRD-2) — 4 angka cabang (Dokumen 4 §6 / Rencana Tim
 * Mandiri bagian 4), dihitung LIVE dari data yang sudah ada (pos_sales,
 * pos_stock_movements, pos_shifts (selisih kas tutup shift), customer_complaints dari
 * PRD-3) — TIDAK ADA tabel snapshot baru. "2 minggu merah berturut-turut"
 * (bagian 4) dicek dengan menghitung ulang minggu lalu dari data historis
 * yang sama, bukan dari snapshot tersimpan — semua sumbernya punya
 * tanggal, jadi bisa dihitung untuk periode kapan pun tanpa cron.
 *
 * Visibilitas SENGAJA dibuka untuk semua karyawan BU Haengbocake (bukan
 * daftar allowlist seperti `revenue_dashboard_viewers`) — SOP minta
 * "terlihat oleh semua staf cabang", dan belum ada roster per-cabang
 * otoritatif di skema untuk membedakan staf Pare vs Semarang (sama
 * keterbatasan dengan PRD-9), jadi kedua cabang terlihat oleh siapa pun
 * di BU ini.
 */

export type ScorecardBranch = "Pare" | "Semarang";
export type ScorecardBand = "green" | "yellow" | "red" | "measuring" | "unset";

export interface ScorecardMetric {
  key: "waste" | "cash_diff" | "omzet" | "complaints";
  label: string;
  value: number;
  displayValue: string;
  band: ScorecardBand;
  note?: string;
}

export interface BranchScorecard {
  branch: ScorecardBranch;
  metrics: ScorecardMetric[];
  previousMetrics: ScorecardMetric[];
  twoWeeksRedKeys: string[];
}

/** Sebelum tanggal ini, metrik keluhan dihitung hijau tanpa syarat (SOP
 *  "selama 30 hari pengukuran pertama, angka keluhan dihitung hijau").
 *  Setelah itu, ambangnya belum ditentukan Owner — SOP sendiri menulis
 *  "[diisi setelah 30 hari pengukuran]", jadi band jadi 'unset' alih-alih
 *  menebak angka yang belum diputuskan. */
const COMPLAINT_TRACKING_EPOCH = "2026-10-18";

async function canView(): Promise<boolean> {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  const profile = await getCurrentProfile();
  return profile?.business_unit === "Haengbocake";
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Senin–Minggu yang memuat `dateStr`, sebagai [start, end]. */
function weekRangeContaining(dateStr: string): [string, string] {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const start = addDays(dateStr, diffToMonday);
  const end = addDays(start, 6);
  return [start, end];
}

function monthStartOf(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

async function sumPaidPosTotal(
  bankAccountId: string,
  startDate: string,
  endDate: string
): Promise<{ total: number; count: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pos_sales")
    .select("total")
    .eq("bank_account_id", bankAccountId)
    .is("voided_at", null)
    .eq("payment_status", "paid")
    .gte("sale_date", startDate)
    .lte("sale_date", endDate);
  const rows = data ?? [];
  return { total: rows.reduce((s, r) => s + r.total, 0), count: rows.length };
}

async function computeWastePercent(
  bankAccountId: string,
  weekStart: string,
  weekEnd: string
): Promise<number> {
  const lossReasons = new Set<WithdrawalReason>(
    (Object.entries(WITHDRAWAL_REASON_META) as [WithdrawalReason, { countsAsLoss: boolean }][])
      .filter(([, meta]) => meta.countsAsLoss)
      .map(([reason]) => reason)
  );
  const admin = createAdminClient();
  const { data } = await admin
    .from("pos_stock_movements")
    .select("type, qty, withdrawal_reason")
    .eq("bank_account_id", bankAccountId)
    .gte("movement_date", weekStart)
    .lte("movement_date", weekEnd);
  let produced = 0;
  let wasted = 0;
  for (const r of data ?? []) {
    if (r.type === "production") produced += r.qty;
    else if (r.type === "withdrawal" && lossReasons.has(r.withdrawal_reason as WithdrawalReason)) {
      wasted += r.qty;
    }
  }
  return produced > 0 ? (wasted / produced) * 100 : 0;
}

/**
 * Jumlah HARI (30 hari terakhir) yang punya selisih hitungan kas saat tutup shift. Sumbernya shift kasir
 * (`pos_shifts`) — bukan tutup kas harian lama. Shift yang ditutup paksa tidak punya hitungan, jadi tidak
 * ikut dihitung (bukan selisih kasir).
 */
async function countCashDiffDays(bankAccountId: string, asOf: string): Promise<number> {
  const since = addDays(asOf, -29);
  const admin = createAdminClient();
  const { data } = await admin
    .from("pos_shifts")
    .select("closed_at")
    .eq("bank_account_id", bankAccountId)
    .eq("status", "closed")
    .is("forced_by", null)
    .not("close_cash_diff", "is", null)
    .neq("close_cash_diff", 0)
    .gte("closed_at", `${since}T00:00:00+07:00`)
    .lte("closed_at", `${asOf}T23:59:59+07:00`);
  return new Set((data ?? []).map((r) => jakartaDateString(new Date(r.closed_at as string)))).size;
}

function wasteBand(pct: number): ScorecardBand {
  if (pct <= 3) return "green";
  if (pct <= 5) return "yellow";
  return "red";
}
function cashDiffBand(days: number): ScorecardBand {
  if (days === 0) return "green";
  if (days <= 2) return "yellow";
  return "red";
}
function omzetBand(pct: number | null): ScorecardBand {
  if (pct === null) return "unset";
  if (pct >= 100) return "green";
  if (pct >= 90) return "yellow";
  return "red";
}

/** Diekspor untuk dipakai ulang Kalkulator Bonus (PRD-10) — poin
 *  scorecard bulan yang dibayar, dihitung "as of" akhir bulan itu, bukan
 *  hari ini. */
export async function computeMetricsAsOf(
  branch: ScorecardBranch,
  bankAccountId: string,
  dailyTarget: number | null,
  asOf: string
): Promise<ScorecardMetric[]> {
  const [weekStart, weekEnd] = weekRangeContaining(asOf);
  const monthStart = monthStartOf(asOf);
  const daysElapsed = Number(asOf.slice(8, 10));

  const [wastePct, cashDiffDays, mtd, complaintCount, txCount30] = await Promise.all([
    computeWastePercent(bankAccountId, weekStart, weekEnd),
    countCashDiffDays(bankAccountId, asOf),
    sumPaidPosTotal(bankAccountId, monthStart, asOf),
    getComplaintCount(branch, 30),
    sumPaidPosTotal(bankAccountId, addDays(asOf, -29), asOf).then((r) => r.count),
  ]);

  const targetPace = dailyTarget ? dailyTarget * daysElapsed : null;
  const omzetPct = targetPace && targetPace > 0 ? (mtd.total / targetPace) * 100 : null;
  const complaintsPer1000 = txCount30 > 0 ? (complaintCount / txCount30) * 1000 : 0;
  const daysSinceEpoch =
    (new Date(asOf).getTime() - new Date(COMPLAINT_TRACKING_EPOCH).getTime()) / 86_400_000;
  const complaintsBand: ScorecardBand = daysSinceEpoch < 30 ? "green" : "unset";

  return [
    {
      key: "waste",
      label: "Waste mingguan",
      value: wastePct,
      displayValue: `${wastePct.toFixed(1)}%`,
      band: wasteBand(wastePct),
      note: `${weekStart} – ${weekEnd}`,
    },
    {
      key: "cash_diff",
      label: "Hari selisih kas (30 hari)",
      value: cashDiffDays,
      displayValue: `${cashDiffDays} hari`,
      band: cashDiffBand(cashDiffDays),
    },
    {
      key: "omzet",
      label: "Omzet bulan berjalan vs target",
      value: omzetPct ?? 0,
      displayValue: omzetPct !== null ? `${omzetPct.toFixed(0)}%` : "Target belum diatur",
      band: omzetBand(omzetPct),
    },
    {
      key: "complaints",
      label: "Keluhan / 1000 transaksi",
      value: complaintsPer1000,
      displayValue: complaintsPer1000.toFixed(1),
      band: complaintsBand,
      note:
        complaintsBand === "green"
          ? "30 hari pengukuran pertama — dihitung hijau"
          : "Ambang belum ditentukan Owner",
    },
  ];
}

export async function getBranchScorecard(branch: ScorecardBranch): Promise<BranchScorecard | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!(await canView())) return null;

  const account = await findPosAccount(branch);
  if (!account) return null;

  const admin = createAdminClient();
  const { data: bankAccount } = await admin
    .from("bank_accounts")
    .select("daily_revenue_target")
    .eq("id", account.id)
    .maybeSingle();
  const dailyTarget = bankAccount?.daily_revenue_target ?? null;

  const today = jakartaDateString(new Date());
  const lastWeek = addDays(today, -7);

  const [metrics, previousMetrics] = await Promise.all([
    computeMetricsAsOf(branch, account.id, dailyTarget, today),
    computeMetricsAsOf(branch, account.id, dailyTarget, lastWeek),
  ]);

  const prevByKey = new Map(previousMetrics.map((m) => [m.key, m]));
  const twoWeeksRedKeys = metrics
    .filter((m) => m.band === "red" && prevByKey.get(m.key)?.band === "red")
    .map((m) => m.key);

  return { branch, metrics, previousMetrics, twoWeeksRedKeys };
}

/**
 * Scorecard untuk beranda karyawan — selalu cabang MILIKNYA sendiri (otomatis dari lokasi kerja /
 * anggota tim / penugasan POS, lihat `resolveUserBranches`). Cabang tak terdeteksi → kedua cabang
 * ditampilkan (`detected: false`), karena scorecard memang terbuka untuk semua staf Haengbocake.
 */
export async function getMyScorecards(): Promise<{
  detected: boolean;
  scorecards: BranchScorecard[];
}> {
  const user = await getCurrentUser();
  if (!user || !(await canView())) return { detected: false, scorecards: [] };
  const branches = await resolveUserBranches(user.id);
  const detected = branches.length > 0;
  const list: ScorecardBranch[] = detected ? branches : ["Pare", "Semarang"];
  const cards = await Promise.all(list.map((b) => getBranchScorecard(b)));
  return { detected, scorecards: cards.filter((c): c is BranchScorecard => c !== null) };
}
