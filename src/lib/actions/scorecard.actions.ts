"use server";

import { createAdminClient } from "./_supabase-admin";
import { getCurrentUser, getCurrentRole, getCurrentProfile } from "@/lib/supabase/cached";
import { findPosAccount } from "./pos.actions";
import { WITHDRAWAL_REASON_META, type WithdrawalReason } from "@/lib/pos/withdrawal-reasons";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { workingDaysBetween, workingDaysInMonth } from "@/lib/scorecard/working-days";
import { sumCakeRevenue as sumCakeRevenueShared } from "@/lib/scorecard/cake-revenue";
import { resolveUserBranches } from "@/lib/branches/user-branches";
import {
  OMZET_GREEN_MIN,
  OMZET_YELLOW_MIN,
  feedbackRanges,
  omzetRanges,
  serviceLevelBandOf,
  serviceLevelRanges,
  wasteBandOf,
  wasteRanges,
  type BandRange,
} from "@/lib/scorecard/thresholds";
import { loadThresholds } from "@/lib/scorecard/thresholds-store";

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
  key: "waste" | "service_level" | "omzet" | "feedback";
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
  /** Angka tampilan: waste & service level 30 hari terakhir, omzet bulan berjalan. */
  metrics: ScorecardMetric[];
  /** Nama metrik (ukuran mingguan, sesuai SOP) yang merah 2 minggu berturut-turut. */
  twoWeeksRedLabels: string[];
  /** Target omzet bulanan POS dan Custom Cake (terpisah); null = belum diatur. */
  omzetTarget: { pos: number | null; cake: number | null };
  /** Hasil akhir bulan lalu; hanya ada pada tanggal 1–7 supaya bisa dievaluasi dan tidak hilang tiba-tiba saat ganti bulan. */
  prevMonth?: { label: string; metrics: ScorecardMetric[] };
}

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
  // PostgREST membatasi 1000 baris per permintaan — satu bulan POS Pare bisa 1.000–2.000 transaksi, jadi wajib
  // dipaginasi (urut id supaya halaman tidak tumpang-tindih), kalau tidak omzet terpotong diam-diam.
  const PAGE = 1000;
  let total = 0;
  let count = 0;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("pos_sales")
      .select("total")
      .eq("bank_account_id", bankAccountId)
      .is("voided_at", null)
      .eq("payment_status", "paid")
      .gte("sale_date", startDate)
      .lte("sale_date", endDate)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const r of rows) total += r.total;
    count += rows.length;
    if (rows.length < PAGE) break;
  }
  return { total, count };
}

const sumCakeRevenue = (branch: ScorecardBranch, from: string, to: string) => sumCakeRevenueShared(createAdminClient(), branch, from, to);

const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
/** Rupiah ringkas untuk catatan: jutaan ditulis "Rp29,5 jt", di bawah sejuta tetap penuh. */
const rupiahJt = (n: number) => (n >= 1_000_000 ? `Rp${(n / 1_000_000).toFixed(1).replace(".", ",")} jt` : rupiah(n));

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

function omzetBand(pct: number | null): ScorecardBand {
  if (pct === null) return "unset";
  if (pct >= OMZET_GREEN_MIN) return "green";
  if (pct >= OMZET_YELLOW_MIN) return "yellow";
  return "red";
}

/** Persen omzet untuk tampilan: dibulatkan, kecuali pembulatan melewati batas warna (99,8% jadi "100%" tetapi berwarna kuning). */
function omzetPctLabel(pct: number): string {
  const rounded = Math.round(pct);
  const crossed = (min: number) => pct < min && rounded >= min;
  return `${crossed(OMZET_GREEN_MIN) || crossed(OMZET_YELLOW_MIN) ? Math.floor(pct) : rounded}%`;
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
  period: "week" | "month" = "week",
  /**
   * Tampilan scorecard: omzet = POS + Custom Cake dibanding target BULANAN masing-masing (`null` = belum diatur;
   * komponen tanpa target tidak ikut dinilai), dengan target dihitung sebanding hari kerja berjalan (Senin–Sabtu).
   * Tanpa ini (Kalkulator Bonus) omzet tetap POS-saja vs target harian kasir.
   */
  opts?: { posTarget: number | null; cakeTarget: number | null }
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

  const [wastePct, serviceLevel, mtd, cakeMtd, th] = await Promise.all([
    computeWastePercent(bankAccountId, weekStart, weekEnd),
    pooledServiceLevel(bankAccountId, weekStart, weekEnd),
    sumPaidPosTotal(bankAccountId, monthStart, asOf),
    opts ? sumCakeRevenue(branch, monthStart, asOf) : Promise.resolve(0),
    // Ambang Waste/Service level/Feedback yang diatur owner (kartu "Ambang warna Scorecard Cabang"); bawaan bila belum ada.
    loadThresholds(createAdminClient()),
  ]);

  const wasteMeasured = wastePct !== null;
  // Target bulanan dibagi per HARI KERJA (Senin–Sabtu; POS tidak aktif Minggu), bukan per hari kalender.
  const workedDays = workingDaysBetween(monthStart, asOf);
  const monthWorkDays = workingDaysInMonth(monthStart);
  const posPace = opts?.posTarget ? (opts.posTarget * workedDays) / monthWorkDays : 0;
  const cakePace = opts?.cakeTarget ? (opts.cakeTarget * workedDays) / monthWorkDays : 0;
  const targetPace = opts
    ? opts.posTarget || opts.cakeTarget
      ? posPace + cakePace
      : null
    : dailyTarget
      ? dailyTarget * daysElapsed
      : null;
  // Hanya komponen yang punya target ikut dihitung, supaya omzet yang tak bertarget tidak menggelembungkan persen.
  const omzetActual = opts ? (opts.posTarget ? mtd.total : 0) + (opts.cakeTarget ? cakeMtd : 0) : mtd.total + cakeMtd;
  // Persentase omzet dinilai terhadap target SEBANDING HARI KERJA BERJALAN (laju), baik untuk kartu bulanan maupun cek
  // "2 minggu merah", supaya awal bulan tidak otomatis merah. Pada hari terakhir periode (dipakai kalkulator bonus), laju
  // sama dengan target bulan penuh, jadi hasilnya tidak berubah.
  const fullTarget = (opts?.posTarget ?? 0) + (opts?.cakeTarget ?? 0);
  const basis = targetPace;
  const omzetPct = basis && basis > 0 ? (omzetActual / basis) * 100 : null;
  // Target ada tapi belum ada hari kerja berjalan (laju): belum bisa dinilai, bukan 0%.
  const omzetTooEarly = !!(opts?.posTarget || opts?.cakeTarget) && workedDays === 0;

  return [
    {
      key: "waste",
      label: `Waste ${windowName}`,
      value: wastePct ?? 0,
      displayValue: wasteMeasured ? `${wastePct.toFixed(1)}%` : "Belum ada data",
      band: wasteMeasured ? wasteBandOf(wastePct, th) : "measuring",
      ranges: wasteRanges(th),
    },
    {
      key: "service_level",
      label: `Service level ${windowName}`,
      value: serviceLevel ?? 0,
      displayValue: serviceLevel !== null ? `${(serviceLevel * 100).toFixed(0)}%` : "Belum ada data",
      band: serviceLevel === null ? "measuring" : serviceLevelBandOf(serviceLevel, th),
      ranges: serviceLevelRanges(th),
    },
    {
      key: "omzet",
      label: "Omzet bulan berjalan vs target",
      value: omzetPct ?? 0,
      displayValue: omzetPct !== null ? omzetPctLabel(omzetPct) : omzetTooEarly ? "Belum ada hari kerja" : "Target belum diatur",
      band: omzetTooEarly ? "measuring" : omzetBand(omzetPct),
      note: opts
        ? fullTarget
          ? `Terkumpul ${rupiahJt(omzetActual)} dari target ${rupiahJt(fullTarget)}. Hari ini idealnya sudah ${rupiahJt(targetPace ?? 0)}.`
          : `POS ${rupiahJt(mtd.total)} + Custom Cake ${rupiahJt(cakeMtd)}`
        : undefined,
      ranges: omzetRanges(),
    },
    {
      // Sumber datanya (form feedback di POS) belum ada: kartu menampilkan "Belum ada data" dan netral (tidak memengaruhi poin)
      // sampai rata-rata bintang tersedia, lalu warnanya mengikuti feedbackBandOf(rata-rata, th).
      key: "feedback",
      label: "Rata-rata feedback customer",
      value: 0,
      displayValue: "Belum ada data",
      band: "measuring",
      ranges: feedbackRanges(th),
    },
  ];
}

export interface OmzetMonth {
  /** "YYYY-MM-01" */
  month: string;
  label: string;
  pos: number;
  cake: number;
  workingDays: number;
}

const MONTH_NAMES_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/**
 * Omzet POS dan Custom Cake tiga bulan penuh terakhir (tidak termasuk bulan berjalan), terlama dulu — acuan saat
 * owner menetapkan target. Hanya owner. Gagal hitung satu bulan → bulan itu dilewati, bukan menggagalkan halaman.
 */
export async function getOmzetHistory(branch: ScorecardBranch): Promise<OmzetMonth[]> {
  if ((await getCurrentRole()) !== "admin") return [];
  const account = await findPosAccount(branch);
  if (!account) return [];
  const today = jakartaDateString(new Date());
  const thisMonth = monthStartOf(today);
  const months: string[] = [];
  for (let i = 3; i >= 1; i--) {
    const d = new Date(`${thisMonth}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 10));
  }
  const rows = await Promise.all(
    months.map(async (m): Promise<OmzetMonth | null> => {
      const next = new Date(`${m}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const last = addDays(next.toISOString().slice(0, 10), -1);
      try {
        const [pos, cake] = await Promise.all([sumPaidPosTotal(account.id, m, last), sumCakeRevenue(branch, m, last)]);
        return {
          month: m,
          label: `${MONTH_NAMES_ID[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`,
          pos: pos.total,
          cake,
          workingDays: workingDaysInMonth(m),
        };
      } catch {
        return null;
      }
    })
  );
  return rows.filter((r): r is OmzetMonth => r !== null);
}

/**
 * Tanggal 1–7: hasil akhir bulan lalu tetap ditampilkan (terlipat) di beranda. `simulate` (hanya di luar produksi) memakai
 * bulan berjalan sebagai "bulan lalu" untuk meninjau tampilannya di tengah bulan.
 */
function prevMonthWindow(today: string, simulate: boolean): { asOf: string; label: string } | null {
  const monthStart = monthStartOf(today);
  const label = (d: string) => MONTH_NAMES_ID[Number(d.slice(5, 7)) - 1];
  if (Number(today.slice(8, 10)) <= 7) {
    const asOf = addDays(monthStart, -1);
    return { asOf, label: label(asOf) };
  }
  if (!simulate) return null;
  const next = new Date(`${monthStart}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const asOf = addDays(next.toISOString().slice(0, 10), -1);
  return { asOf, label: label(asOf) };
}

export async function getBranchScorecard(
  branch: ScorecardBranch,
  prev: { asOf: string; label: string } | null = null
): Promise<BranchScorecard | null> {
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
  const { data: targetRow } = await admin
    .from("scorecard_branch_targets" as never)
    .select("monthly_pos_target, monthly_cake_target")
    .eq("branch", branch)
    .maybeSingle();
  const tr = targetRow as { monthly_pos_target: string | number | null; monthly_cake_target: string | number | null } | null;
  const omzetTarget = {
    pos: tr?.monthly_pos_target == null ? null : Number(tr.monthly_pos_target),
    cake: tr?.monthly_cake_target == null ? null : Number(tr.monthly_cake_target),
  };
  const opts = { posTarget: omzetTarget.pos, cakeTarget: omzetTarget.cake };

  const today = jakartaDateString(new Date());
  const lastWeek = addDays(today, -7);

  // Aturan SOP "2 minggu merah berturut-turut" tetap memakai ukuran mingguan (7 hari bergulir,
  // dibandingkan dengan seminggu sebelumnya).
  const [metrics, weekNow, weekPrev, prevRaw] = await Promise.all([
    computeMetricsAsOf(branch, account.id, dailyTarget, today, "month", opts),
    computeMetricsAsOf(branch, account.id, dailyTarget, today, "week", opts),
    computeMetricsAsOf(branch, account.id, dailyTarget, lastWeek, "week", opts),
    prev ? computeMetricsAsOf(branch, account.id, dailyTarget, prev.asOf, "month", opts) : Promise.resolve(null),
  ]);
  // Hasil akhir bulan lalu: label disesuaikan (bukan "bulan berjalan"/"hari ini"), dan catatan laju dibuang karena pada hari
  // terakhir laju sama dengan target penuh.
  const prevMonth =
    prev && prevRaw
      ? {
          label: prev.label,
          metrics: prevRaw.map((m) => ({
            ...m,
            label: m.key === "omzet" ? `Omzet ${prev.label} vs target` : m.label.replace(" 30 hari terakhir", ` 30 hari s.d. akhir ${prev.label}`),
            note: m.note ? m.note.split(" Hari ini idealnya")[0] : undefined,
          })),
        }
      : undefined;

  const prevByKey = new Map(weekPrev.map((m) => [m.key, m]));
  const twoWeeksRedLabels = weekNow
    .filter((m) => m.band === "red" && prevByKey.get(m.key)?.band === "red")
    .map((m) => m.label);

  return { branch, metrics, twoWeeksRedLabels, omzetTarget, prevMonth };
}

/**
 * Scorecard untuk beranda karyawan — selalu cabang MILIKNYA sendiri (otomatis dari lokasi kerja /
 * anggota tim / penugasan POS, lihat `resolveUserBranches`). Cabang tak terdeteksi → kedua cabang
 * ditampilkan (`detected: false`), karena scorecard memang terbuka untuk semua staf Haengbocake.
 */
export async function getMyScorecards(opts?: { simulatePrevMonth?: boolean }): Promise<{
  detected: boolean;
  scorecards: BranchScorecard[];
}> {
  const user = await getCurrentUser();
  if (!user || !(await canView())) return { detected: false, scorecards: [] };
  const branches = await resolveUserBranches(user.id);
  const detected = branches.length > 0;
  const list: ScorecardBranch[] = detected ? branches : ["Pare", "Semarang"];
  const prev = prevMonthWindow(jakartaDateString(new Date()), !!opts?.simulatePrevMonth && process.env.NODE_ENV !== "production");
  const cards = await Promise.all(list.map((b) => getBranchScorecard(b, prev)));
  // Cabang tidak terdeteksi → dua cabang tampil, jadi tanpa angka rupiah (nominal omzet/target cabang lain bukan urusan
  // mereka): hanya persentase. Karyawan dengan cabang terdeteksi tetap melihat angka cabangnya sendiri.
  const scorecards = cards
    .filter((c): c is BranchScorecard => c !== null)
    .map((c) =>
      detected
        ? c
        : {
            ...c,
            omzetTarget: { pos: null, cake: null },
            metrics: c.metrics.map((m) => (m.key === "omzet" ? { ...m, note: undefined } : m)),
            prevMonth: c.prevMonth && { ...c.prevMonth, metrics: c.prevMonth.metrics.map((m) => (m.key === "omzet" ? { ...m, note: undefined } : m)) },
          }
    );
  return { detected, scorecards };
}
