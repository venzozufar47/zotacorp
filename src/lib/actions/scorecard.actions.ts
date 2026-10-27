"use server";

import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser, getCurrentRole, getCurrentProfile } from "@/lib/supabase/cached";
import { findPosAccount } from "./pos.actions";
import { getComplaintCount, getComplaintCountBetween } from "./customer-complaints.actions";
import { WITHDRAWAL_REASON_META, type WithdrawalReason } from "@/lib/pos/withdrawal-reasons";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { resolveUserBranches } from "@/lib/branches/user-branches";
import {
  SERVICE_LEVEL_GREEN_MIN,
  SERVICE_LEVEL_YELLOW_MIN,
  OMZET_GREEN_MIN,
  OMZET_YELLOW_MIN,
  WASTE_GREEN_MAX,
  WASTE_YELLOW_MAX,
  omzetRanges,
  serviceLevelRanges,
  wasteRanges,
  type BandRange,
} from "@/lib/scorecard/thresholds";

/**
 * Scorecard Cabang (PRD-2) — 4 angka cabang (Dokumen 4 §6 / Rencana Tim
 * Mandiri bagian 4), dihitung LIVE dari data yang sudah ada (pos_sales,
 * pos_stock_movements, pos_service_level_daily (kesiapan produk — menggantikan "hari selisih
 * kas", yang selalu 0 karena kas ketat), customer_complaints dari
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
  key: "waste" | "service_level" | "omzet" | "complaints";
  label: string;
  value: number;
  displayValue: string;
  band: ScorecardBand;
  note?: string;
  /** Rentang tiap warna untuk panduan di tampilan — dari ambang yang SAMA dengan penentu band. */
  ranges?: BandRange[];
  /** Catatan panduan bila rentang belum ada (mis. ambang belum ditentukan). */
  rangesNote?: string;
}

export interface BranchScorecard {
  branch: ScorecardBranch;
  /** Angka tampilan: waste & service level 30 hari terakhir, omzet & keluhan bulan berjalan. */
  metrics: ScorecardMetric[];
  /** Nama metrik (ukuran mingguan, sesuai SOP) yang merah 2 minggu berturut-turut. */
  twoWeeksRedLabels: string[];
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

/**
 * Persen susut pada jendela [start, end]. `null` = tidak ada produksi tercatat di jendela itu —
 * BUKAN 0%: nol hijau palsu muncul tiap awal pekan saat belum ada produksi.
 */
async function computeWastePercent(
  bankAccountId: string,
  weekStart: string,
  weekEnd: string
): Promise<number | null> {
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
  return produced > 0 ? (wasted / produced) * 100 : null;
}

/**
 * Service level 7 hari terakhir, DIGABUNG (pooled) dari snapshot harian: Σ ready_sum ÷ Σ (SKU × sampel).
 * Hari tanpa aktivitas / tanpa baseline (percent null) tidak ikut — sama dengan ringkasan di dashboard
 * (`getServiceLevelSummary`). `null` = belum ada data terhitung. Ambang warna tetap (lihat
 * `lib/scorecard/thresholds`), tidak mengikuti target per outlet.
 */
async function pooledServiceLevel(
  bankAccountId: string,
  start: string,
  end: string
): Promise<number | null> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("pos_service_level_daily")
    .select("ready_sum, tracked_skus, sample_count, percent")
    .eq("bank_account_id", bankAccountId)
    .gte("snapshot_date", start)
    .lte("snapshot_date", end);
  let ready = 0;
  let total = 0;
  for (const r of rows ?? []) {
    const denom = r.tracked_skus * r.sample_count;
    if (r.percent === null || denom === 0) continue;
    ready += r.ready_sum;
    total += denom;
  }
  return total > 0 ? ready / total : null;
}

function wasteBand(pct: number): ScorecardBand {
  if (pct <= WASTE_GREEN_MAX) return "green";
  if (pct <= WASTE_YELLOW_MAX) return "yellow";
  return "red";
}
function serviceLevelBand(pct: number | null): ScorecardBand {
  if (pct === null) return "measuring";
  if (pct >= SERVICE_LEVEL_GREEN_MIN) return "green";
  if (pct >= SERVICE_LEVEL_YELLOW_MIN) return "yellow";
  return "red";
}
function omzetBand(pct: number | null): ScorecardBand {
  if (pct === null) return "unset";
  if (pct >= OMZET_GREEN_MIN) return "green";
  if (pct >= OMZET_YELLOW_MIN) return "yellow";
  return "red";
}

/** Diekspor untuk dipakai ulang Kalkulator Bonus (PRD-10) — poin
 *  scorecard bulan yang dibayar, dihitung "as of" akhir bulan itu, bukan
 *  hari ini. */
export async function computeMetricsAsOf(
  branch: ScorecardBranch,
  bankAccountId: string,
  dailyTarget: number | null,
  asOf: string,
  /**
   * "week" (bawaan; dipakai Kalkulator Bonus & cek 2 minggu merah): 7 hari terakhir bergulir, keluhan 30 hari.
   * "month" (tampilan scorecard): waste & service level 30 hari terakhir; omzet & keluhan 1 tanggal bulan `asOf` s.d. `asOf`.
   */
  period: "week" | "month" = "week"
): Promise<ScorecardMetric[]> {
  // Mingguan: 7 hari bergulir (bukan Senin–Minggu): tidak kosong tiap Senin, dan tidak ikut menghitung
  // hari sesudah `asOf` saat Kalkulator Bonus menghitung akhir bulan lampau.
  const weekEnd = asOf;
  const monthStart = monthStartOf(asOf);
  // Tampilan: waste & service level adalah rasio → 30 hari bergulir (selalu cukup data, tidak mulai dari nol tiap
  // tanggal 1); omzet & keluhan tetap bulan berjalan karena dibandingkan dengan target bulanan.
  const weekStart = period === "month" ? addDays(asOf, -29) : addDays(asOf, -6);
  const windowName = period === "month" ? "30 hari terakhir" : "7 hari terakhir";
  const daysElapsed = Number(asOf.slice(8, 10));

  const [wastePct, serviceLevel, mtd, complaintCount, txCount30] = await Promise.all([
    computeWastePercent(bankAccountId, weekStart, weekEnd),
    pooledServiceLevel(bankAccountId, weekStart, weekEnd),
    sumPaidPosTotal(bankAccountId, monthStart, asOf),
    period === "month"
      ? getComplaintCountBetween(branch, monthStart, asOf)
      : getComplaintCount(branch, 30),
    period === "month"
      ? sumPaidPosTotal(bankAccountId, monthStart, asOf).then((r) => r.count)
      : sumPaidPosTotal(bankAccountId, addDays(asOf, -29), asOf).then((r) => r.count),
  ]);

  const wasteMeasured = wastePct !== null;
  const targetPace = dailyTarget ? dailyTarget * daysElapsed : null;
  const omzetPct = targetPace && targetPace > 0 ? (mtd.total / targetPace) * 100 : null;
  const complaintsPer1000 = txCount30 > 0 ? (complaintCount / txCount30) * 1000 : 0;
  const daysSinceEpoch =
    (new Date(asOf).getTime() - new Date(COMPLAINT_TRACKING_EPOCH).getTime()) / 86_400_000;
  const complaintsBand: ScorecardBand = daysSinceEpoch < 30 ? "green" : "unset";

  return [
    {
      key: "waste",
      label: `Waste ${windowName}`,
      value: wastePct ?? 0,
      displayValue: wasteMeasured ? `${wastePct.toFixed(1)}%` : "Belum ada data",
      band: wasteMeasured ? wasteBand(wastePct) : "measuring",
      ranges: wasteRanges(),
    },
    {
      key: "service_level",
      label: `Service level ${windowName}`,
      value: serviceLevel ?? 0,
      displayValue: serviceLevel !== null ? `${(serviceLevel * 100).toFixed(0)}%` : "Belum ada data",
      band: serviceLevelBand(serviceLevel),
      ranges: serviceLevelRanges(),
    },
    {
      key: "omzet",
      label: "Omzet bulan berjalan vs target",
      value: omzetPct ?? 0,
      displayValue: omzetPct !== null ? `${omzetPct.toFixed(0)}%` : "Target belum diatur",
      band: omzetBand(omzetPct),
      ranges: omzetRanges(),
    },
    {
      key: "complaints",
      label: "Keluhan / 1000 transaksi",
      value: complaintsPer1000,
      displayValue: complaintsPer1000.toFixed(1),
      band: complaintsBand,
      rangesNote:
        "Ambang belum ditentukan Owner (SOP: diisi setelah 30 hari pengukuran). Selama 30 hari pertama sejak 18 Okt 2026 angkanya otomatis dihitung hijau.",
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

  // Aturan SOP "2 minggu merah berturut-turut" tetap memakai ukuran mingguan (7 hari bergulir,
  // dibandingkan dengan seminggu sebelumnya).
  const [metrics, weekNow, weekPrev] = await Promise.all([
    computeMetricsAsOf(branch, account.id, dailyTarget, today, "month"),
    computeMetricsAsOf(branch, account.id, dailyTarget, today),
    computeMetricsAsOf(branch, account.id, dailyTarget, lastWeek),
  ]);

  const prevByKey = new Map(weekPrev.map((m) => [m.key, m]));
  const twoWeeksRedLabels = weekNow
    .filter((m) => m.band === "red" && prevByKey.get(m.key)?.band === "red")
    .map((m) => m.label);

  return { branch, metrics, twoWeeksRedLabels };
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
