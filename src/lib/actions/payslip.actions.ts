"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import type {
  PayslipSettings,
  AttendanceLog,
  OvertimeRequest,
  PayslipDeliverable,
  PayslipBreakdown,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adminGuard(role: string | null) {
  if (role !== "admin") throw new Error("Forbidden");
}

/** Count calendar days in (month, year) whose weekday (0=Sun..6=Sat) is in `weekdays`. */
function countWeekdaysInMonth(month: number, year: number, weekdays: number[]): number {
  if (!weekdays || weekdays.length === 0) return 0;
  const set = new Set(weekdays);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (set.has(dow)) count++;
  }
  return count;
}

/**
 * Resolve the effective "expected work days" for a given month based on the
 * configured mode. Mirrors the same rule the UI shows.
 *
 * - manual: the static number stored on settings
 * - weekly_pattern: count of matching weekdays in that month
 */
/**
 * Auto-detect pinjaman karyawan di bulan target dengan scan
 * `cashflow_transactions`. Match: debit > 0 + description/notes
 * mengandung kata "pinjem"/"pinjaman" + token nama karyawan
 * (nickname atau nama depan).
 *
 * Dijalankan tiap kali payslip di-(re)calculate sehingga utang
 * di-pickup tanpa admin perlu input manual. Bulan baru dengan
 * pinjaman baru otomatis terhitung saat re-calculate.
 *
 * Token matching tujuannya broad — admin sering nulis "di pinjem
 * mb intan", "DIPINJEM TASYA", dll. yang inkonsisten kapital + spasi.
 */
async function detectLoanDebts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  month: number,
  year: number
): Promise<{ total: number; note: string | null }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, full_name")
    .eq("id", userId)
    .single();
  if (!profile) return { total: 0, note: null };

  const tokens = new Set<string>();
  if (profile.nickname) tokens.add(profile.nickname.toLowerCase().trim());
  if (profile.full_name) {
    const first = profile.full_name.trim().split(/\s+/)[0];
    if (first) tokens.add(first.toLowerCase());
  }
  if (tokens.size === 0) return { total: 0, note: null };

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const { data } = await supabase
    .from("cashflow_transactions")
    .select("debit, description, notes, transaction_date")
    .gte("transaction_date", start)
    .lt("transaction_date", end)
    .gt("debit", 0)
    .or("description.ilike.%pinjem%,notes.ilike.%pinjem%")
    .order("transaction_date", { ascending: true });

  type Match = { date: string; debit: number; description: string };
  const matches: Match[] = [];
  for (const tx of data ?? []) {
    const haystack = `${tx.description ?? ""} ${tx.notes ?? ""}`.toLowerCase();
    if ([...tokens].some((t) => haystack.includes(t))) {
      matches.push({
        date: tx.transaction_date,
        debit: Number(tx.debit ?? 0),
        description: (tx.description ?? tx.notes ?? "").trim(),
      });
    }
  }
  if (matches.length === 0) return { total: 0, note: null };

  const total = matches.reduce((s, m) => s + m.debit, 0);
  // Format: "DD/MM Rp X — deskripsi" per baris.
  const lines = matches.map((m) => {
    const [, mm, dd] = m.date.split("-");
    const rupiah = m.debit.toLocaleString("id-ID");
    return `• ${dd}/${mm} Rp ${rupiah}${m.description ? ` — ${m.description}` : ""}`;
  });
  const note = `Auto-detect dari cashflow (${matches.length} transaksi):\n${lines.join("\n")}`;
  return { total, note };
}

function resolveExpectedWorkDays(
  settings: PayslipSettings,
  month: number,
  year: number
): number {
  const mode = settings.expected_days_mode ?? "manual";
  if (mode === "none") return 0;
  if (mode === "weekly_pattern") {
    return countWeekdaysInMonth(month, year, settings.expected_weekdays ?? []);
  }
  return settings.expected_work_days;
}

/**
 * Pure calculation: compute payslip fields from attendance + settings.
 * Also returns `breakdown` — a per-day snapshot for employee transparency.
 *
 * For per-minutes late penalty, the actual penalty is computed on the
 * aggregate (`floor(total_penalized / interval) * amount`) so partial
 * intervals don't stack across days. The per-day penalty in the breakdown
 * is allocated proportionally from the aggregate — the per-day values
 * always sum to exactly the aggregate penalty.
 */
function calculateFromAttendance(
  settings: PayslipSettings,
  logs: Pick<AttendanceLog, "date" | "checked_out_at" | "overtime_minutes" | "overtime_status" | "late_minutes" | "status" | "is_overtime">[],
  overtimeRequests: Pick<OvertimeRequest, "attendance_log_id" | "overtime_minutes" | "status">[],
  gracePeriodMin: number = 0
) {
  const completedLogs = logs.filter((l) => l.checked_out_at);
  const actualWorkDays = completedLogs.length;
  const expected = settings.expected_work_days;
  const baseSalary = Number(settings.monthly_fixed_amount);

  // Prorate — this already rewards extra days (actual/expected > 1 when over-worked),
  // so there is no separate extra-day bonus.
  // Mode "none": attendance tidak mempengaruhi prorate — full base salary
  // selama karyawan ada di sistem (dipakai untuk freelancer / role yang
  // tidak terikat presence).
  const proratedSalary =
    settings.expected_days_mode === "none"
      ? baseSalary
      : expected > 0
        ? Math.round((actualWorkDays / expected) * baseSalary)
        : 0;

  // Overtime — only count approved (overtime_requests currently informational;
  // calculation uses log.overtime_status = 'approved' directly)
  void overtimeRequests;
  let totalOvertimeMinutes = 0;
  let overtimePay = 0;
  const overtimeDays: PayslipBreakdown["overtime_days"] = [];

  if (settings.overtime_mode === "hourly_tiered") {
    for (const log of completedLogs) {
      if (!log.is_overtime || log.overtime_minutes <= 0) continue;
      if (log.overtime_status !== "approved") continue;
      const mins = log.overtime_minutes;
      totalOvertimeMinutes += mins;
      const hours = mins / 60;
      const firstHour = Math.min(hours, 1);
      const nextHours = Math.max(hours - 1, 0);
      const dayPay = Math.round(
        firstHour * Number(settings.ot_first_hour_rate) +
        nextHours * Number(settings.ot_next_hour_rate)
      );
      overtimePay += dayPay;
      overtimeDays.push({ date: log.date, minutes: mins, pay: dayPay });
    }
  } else if (settings.overtime_mode === "half_daily") {
    // 50% gaji harian per hari OT (terlepas dari berapa menit OT-nya).
    // Daily pay diturunkan dari base_salary / expected_work_days. Kalau
    // expected = 0 (mode "none"/"fixed" / belum di-set), fallback ke 0
    // — admin perlu set expected_work_days untuk basis kalkulasi ini.
    const expectedDays = expected > 0 ? expected : 0;
    const dailyHalfPay = expectedDays > 0
      ? Math.round((baseSalary / expectedDays) * 0.5)
      : 0;
    for (const log of completedLogs) {
      if (!log.is_overtime || log.overtime_minutes <= 0) continue;
      if (log.overtime_status !== "approved") continue;
      totalOvertimeMinutes += log.overtime_minutes;
      overtimePay += dailyHalfPay;
      overtimeDays.push({
        date: log.date,
        minutes: log.overtime_minutes,
        pay: dailyHalfPay,
      });
    }
  } else {
    // fixed_per_day
    const dailyRate = Number(settings.ot_fixed_daily_rate);
    for (const log of completedLogs) {
      if (!log.is_overtime || log.overtime_minutes <= 0) continue;
      if (log.overtime_status !== "approved") continue;
      totalOvertimeMinutes += log.overtime_minutes;
      const dayPay = Math.round(dailyRate);
      overtimePay += dayPay;
      overtimeDays.push({ date: log.date, minutes: log.overtime_minutes, pay: dayPay });
    }
  }

  // Late penalty — exclude excused (status !== 'late')
  // Display: raw late_minutes (from standard sign-in time)
  // Penalty: late_minutes minus grace period (penalized portion only)
  let totalLateMinutes = 0;
  let penalizedLateMinutes = 0;
  let latePenalty = 0;
  let lateDays = 0;

  type LateRow = {
    date: string;
    raw_minutes: number;
    after_grace_minutes: number;
    excused: boolean;
  };
  const lateRows: LateRow[] = [];

  for (const log of completedLogs) {
    // Show excused late days too — zero penalty, flagged — so employees see
    // the full picture. Only 'late' (unexcused) counts toward penalty.
    if (log.status === "late_excused" && log.late_minutes > 0) {
      totalLateMinutes += log.late_minutes;
      lateRows.push({
        date: log.date,
        raw_minutes: log.late_minutes,
        after_grace_minutes: 0,
        excused: true,
      });
    } else if (log.status === "late" && log.late_minutes > 0) {
      totalLateMinutes += log.late_minutes;
      const penalized = Math.max(log.late_minutes - gracePeriodMin, 0);
      if (penalized > 0) {
        penalizedLateMinutes += penalized;
        lateDays++;
      }
      lateRows.push({
        date: log.date,
        raw_minutes: log.late_minutes,
        after_grace_minutes: penalized,
        excused: false,
      });
    }
  }

  // Aggregate penalty calculation (unchanged)
  if (settings.late_penalty_mode === "per_minutes" && settings.late_penalty_interval_min > 0) {
    const intervals = Math.floor(penalizedLateMinutes / settings.late_penalty_interval_min);
    latePenalty = Math.round(intervals * Number(settings.late_penalty_amount));
  } else if (settings.late_penalty_mode === "per_day") {
    latePenalty = Math.round(lateDays * Number(settings.late_penalty_amount));
  }

  // Allocate per-day penalty. For per_day: each unexcused late day gets the flat amount.
  // For per_minutes: proportional to after_grace_minutes, with rounding residual
  // assigned to the last row so the sum matches the aggregate exactly.
  const lateDaysBreakdown: PayslipBreakdown["late_days"] = lateRows.map((r) => ({
    ...r,
    penalty: 0,
  }));

  if (settings.late_penalty_mode === "per_day") {
    const flat = Math.round(Number(settings.late_penalty_amount));
    for (const row of lateDaysBreakdown) {
      if (!row.excused && row.after_grace_minutes > 0) row.penalty = flat;
    }
  } else if (settings.late_penalty_mode === "per_minutes" && penalizedLateMinutes > 0 && latePenalty > 0) {
    let allocated = 0;
    const penalizedRows = lateDaysBreakdown.filter(
      (r) => !r.excused && r.after_grace_minutes > 0
    );
    penalizedRows.forEach((row, idx) => {
      if (idx === penalizedRows.length - 1) {
        row.penalty = latePenalty - allocated;
      } else {
        const share = Math.round((row.after_grace_minutes / penalizedLateMinutes) * latePenalty);
        row.penalty = share;
        allocated += share;
      }
    });
  }

  const breakdown: PayslipBreakdown = {
    overtime_mode: settings.overtime_mode as PayslipBreakdown["overtime_mode"],
    late_penalty_mode: settings.late_penalty_mode as PayslipBreakdown["late_penalty_mode"],
    grace_period_min: gracePeriodMin,
    overtime_days: overtimeDays.sort((a, b) => a.date.localeCompare(b.date)),
    late_days: lateDaysBreakdown.sort((a, b) => a.date.localeCompare(b.date)),
  };

  return {
    actual_work_days: actualWorkDays,
    expected_work_days: expected,
    base_salary: baseSalary,
    prorated_salary: proratedSalary,
    extra_day_bonus: 0,
    total_overtime_minutes: totalOvertimeMinutes,
    overtime_pay: overtimePay,
    total_late_minutes: totalLateMinutes,
    late_penalty: latePenalty,
    breakdown,
  };
}

/**
 * Compute weighted achievement % across deliverables.
 * Per-row achievement = realization / target (0 if target <= 0).
 * Weighted average = Σ(achievement_i × weight_i) / Σweight_i.
 * Returns 0 if there are no rows with weight.
 */
function computeDeliverablesAchievement(
  deliverables: Pick<PayslipDeliverable, "target" | "realization" | "weight_pct">[]
): number {
  const rows = deliverables.filter((d) => Number(d.weight_pct) > 0);
  if (rows.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const d of rows) {
    const target = Number(d.target);
    const realization = Number(d.realization);
    const weight = Number(d.weight_pct);
    const achievement = target > 0 ? realization / target : 0;
    weightedSum += achievement * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? (weightedSum / weightTotal) * 100 : 0;
}

/**
 * Combine calculated attendance + deliverables components into a net total,
 * applying weights when calculation_basis === 'both'.
 */
function computeNetTotal(
  basis: "presence" | "deliverables" | "both" | "fixed",
  attW: number,
  delW: number,
  fields: {
    prorated_salary: number;
    overtime_pay: number;
    late_penalty: number;
    deliverables_pay: number;
    monthly_bonus: number;
    debt_deduction: number;
    other_penalty: number;
    extra_work_pay: number;
    base_salary: number;
  }
): number {
  const attendanceBucket =
    fields.prorated_salary + fields.overtime_pay - fields.late_penalty;
  const deliverablesBucket = fields.deliverables_pay;

  let combined = 0;
  if (basis === "fixed") {
    // Skip attendance + deliverables sepenuhnya — bayar base salary
    // utuh. Cocok untuk kontrak / freelancer flat fee.
    combined = fields.base_salary;
  } else if (basis === "presence") {
    combined = attendanceBucket;
  } else if (basis === "deliverables") {
    combined = deliverablesBucket;
  } else {
    const aw = Math.max(0, attW) / 100;
    const dw = Math.max(0, delW) / 100;
    combined = Math.round(attendanceBucket * aw + deliverablesBucket * dw);
  }

  // Extra-work pay sits OUTSIDE the weighted attendance/deliverables
  // bucket — it's a flat add regardless of basis or weight, since it
  // represents discrete tasks not covered by the time-based salary.
  return (
    combined +
    fields.extra_work_pay +
    fields.monthly_bonus -
    fields.debt_deduction -
    fields.other_penalty
  );
}

// ---------------------------------------------------------------------------
// Settings CRUD
// ---------------------------------------------------------------------------

export async function getPayslipSettings(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslip_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function upsertPayslipSettings(
  userId: string,
  fields: Partial<Omit<PayslipSettings, "id" | "user_id" | "created_at" | "updated_at">>
) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();

  // Check if exists
  const existing = await getPayslipSettings(userId);

  if (existing) {
    const { error } = await supabase
      .from("payslip_settings")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("payslip_settings")
      .insert({ user_id: userId, ...fields });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/payslips");
  return {};
}

export async function finalizePayslipSettings(userId: string) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();
  const { error } = await supabase
    .from("payslip_settings")
    .update({
      is_finalized: true,
      finalized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) return { error: error.message };

  revalidatePath("/admin/payslips");
  return {};
}

/**
 * Finalize semua payslip_settings draft sekaligus — dipakai di
 * /admin/payslips/variables setelah admin selesai bulk-edit. Hanya
 * row yang `is_finalized = false` yang ke-flip; row yang sudah
 * finalized di-skip (tidak di-touch). Return jumlah yang berhasil.
 */
export async function bulkFinalizePayslipSettings(): Promise<{
  finalizedCount: number;
  error?: string;
}> {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("payslip_settings")
    .update({ is_finalized: true, finalized_at: now, updated_at: now })
    .eq("is_finalized", false)
    .select("user_id");
  if (error) return { finalizedCount: 0, error: error.message };

  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  return { finalizedCount: (data ?? []).length };
}

/**
 * Calculate (atau recalculate) payslip semua karyawan finalized untuk
 * (month, year) tertentu. Skip karyawan settings draft / no settings.
 * Loop sequential (karena calculatePayslip self-contained dan butuh
 * panggilan terpisah per user). Return jumlah berhasil + skipped.
 */
export async function bulkCalculatePayslips(
  month: number,
  year: number
): Promise<{
  calculatedCount: number;
  skippedCount: number;
  errorCount: number;
}> {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();
  const { data: finalizedSettings } = await supabase
    .from("payslip_settings")
    .select("user_id")
    .eq("is_finalized", true);

  let calculatedCount = 0;
  let errorCount = 0;
  for (const s of finalizedSettings ?? []) {
    const res = await calculatePayslip(s.user_id, month, year);
    if (res.error) errorCount += 1;
    else calculatedCount += 1;
  }
  const skippedCount = 0; // implicit: yang draft/no-settings tidak ter-fetch
  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  return { calculatedCount, skippedCount, errorCount };
}

/**
 * Bulk-finalize semua payslip draft di (month, year). Reopen tetap
 * per-row via existing `reopenPayslip(payslipId)` — tidak ada pair
 * bulk-reopen karena reopening 20+ payslip sekaligus jarang di-do
 * oleh sengaja (lebih sering admin reopen 1-2 untuk koreksi).
 */
export async function bulkFinalizePayslipsForMonth(
  month: number,
  year: number
): Promise<{ finalizedCount: number; error?: string }> {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payslips")
    .update({ status: "finalized", updated_at: new Date().toISOString() })
    .eq("month", month)
    .eq("year", year)
    .eq("status", "draft")
    .select("id");
  if (error) return { finalizedCount: 0, error: error.message };
  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  return { finalizedCount: (data ?? []).length };
}

// ---------------------------------------------------------------------------
// Payslip Calculation
// ---------------------------------------------------------------------------

export async function calculatePayslip(userId: string, month: number, year: number) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();

  // Get settings
  const { data: settings } = await supabase
    .from("payslip_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!settings) return { error: "Payslip settings not found for this employee." };
  if (!settings.is_finalized) return { error: "Payslip settings must be finalized before calculating." };

  const basis = settings.calculation_basis as
    | "presence"
    | "deliverables"
    | "both"
    | "fixed";
  // basis="fixed" skip semua attendance + deliverables — bayar base salary.
  const includesAttendance = basis === "presence" || basis === "both";
  const includesDeliverables = basis === "deliverables" || basis === "both";
  const baseSalary = Number(settings.monthly_fixed_amount);

  // Resolve expected work days for this month according to the configured
  // mode (manual number or weekly pattern). We override
  // settings.expected_work_days locally so calculateFromAttendance sees the
  // per-month value without changing the settings row.
  const resolvedExpected = resolveExpectedWorkDays(settings, month, year);
  const effectiveSettings: PayslipSettings = {
    ...settings,
    expected_work_days: resolvedExpected,
  };

  // Attendance-side calculation (only when attendance is in play)
  const emptyBreakdown: PayslipBreakdown = {
    overtime_mode: settings.overtime_mode as PayslipBreakdown["overtime_mode"],
    late_penalty_mode: settings.late_penalty_mode as PayslipBreakdown["late_penalty_mode"],
    grace_period_min: 0,
    overtime_days: [],
    late_days: [],
  };
  let attCalc = {
    actual_work_days: 0,
    expected_work_days: resolvedExpected,
    base_salary: baseSalary,
    prorated_salary: 0,
    total_overtime_minutes: 0,
    overtime_pay: 0,
    total_late_minutes: 0,
    late_penalty: 0,
    breakdown: emptyBreakdown,
  };

  if (includesAttendance) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("grace_period_min")
      .eq("id", userId)
      .single();
    const gracePeriodMin = profile?.grace_period_min ?? 0;

    const startDate2 = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate2 = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    const { data: logs } = await supabase
      .from("attendance_logs")
      .select("id, date, checked_out_at, overtime_minutes, overtime_status, late_minutes, status, is_overtime")
      .eq("user_id", userId)
      .gte("date", startDate2)
      .lt("date", endDate2);

    const logIds = (logs ?? []).map((l) => l.id);
    let overtimeRequests: Pick<OvertimeRequest, "attendance_log_id" | "overtime_minutes" | "status">[] = [];
    if (logIds.length > 0) {
      const { data: otReqs } = await supabase
        .from("overtime_requests")
        .select("attendance_log_id, overtime_minutes, status")
        .in("attendance_log_id", logIds);
      overtimeRequests = otReqs ?? [];
    }

    attCalc = calculateFromAttendance(effectiveSettings, logs ?? [], overtimeRequests, gracePeriodMin);
  }

  // Extra-work pay: per-entry resolution. Tiap log pakai formula:
  //   1. formula_override (kalau di-set admin di payslip review),
  //   2. fallback ke kind.formula_kind (default).
  // Formula:
  //   - fixed → pay = fixed_rate_idr (atau custom_rate_idr kalau override='fixed')
  //   - custom → pay = custom_rate_idr (admin set per-entry; null = 0)
  //   - daily_multiplier → pay = (multiplier_override ?? kind.daily_multiplier)
  //                              × (base_salary / expected_work_days)
  // Independent dari calculation_basis — ini honor diskrit di luar
  // skema gaji reguler.
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  let extraWorkPay = 0;
  const extraWorkDays: NonNullable<PayslipBreakdown["extra_work_days"]> = [];
  {
    const { data: ewLogs } = await supabase
      .from("extra_work_logs")
      .select(
        "date, kind, notes, formula_override, custom_rate_idr, multiplier_override"
      )
      .eq("user_id", userId)
      .gte("date", startDate)
      .lt("date", endDate);
    // Lookup formula default per kind name (in-memory, biasanya cuma
    // beberapa kind aktif).
    const { data: kindRows } = await supabase
      .from("extra_work_kinds")
      .select("name, formula_kind, fixed_rate_idr, daily_multiplier");
    type KindMeta = {
      formula_kind: string;
      fixed_rate_idr: number;
      daily_multiplier: number;
    };
    const kindByName = new Map<string, KindMeta>(
      (kindRows ?? []).map((k) => [
        k.name,
        {
          formula_kind: k.formula_kind,
          fixed_rate_idr: Number(k.fixed_rate_idr),
          daily_multiplier: Number(k.daily_multiplier),
        },
      ])
    );
    const dailyPay =
      resolvedExpected > 0 ? baseSalary / resolvedExpected : 0;

    for (const row of ewLogs ?? []) {
      const meta = kindByName.get(row.kind);
      const formula =
        row.formula_override ?? meta?.formula_kind ?? "fixed";
      let pay = 0;
      if (formula === "fixed") {
        pay =
          row.custom_rate_idr != null
            ? Number(row.custom_rate_idr)
            : Number(meta?.fixed_rate_idr ?? 0);
      } else if (formula === "custom") {
        pay = row.custom_rate_idr != null ? Number(row.custom_rate_idr) : 0;
      } else if (formula === "daily_multiplier") {
        const mult =
          row.multiplier_override != null
            ? Number(row.multiplier_override)
            : Number(meta?.daily_multiplier ?? 0);
        pay = Math.round(mult * dailyPay);
      }
      extraWorkDays.push({ date: row.date, kind: row.kind, pay });
      extraWorkPay += pay;
    }
    extraWorkDays.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Check existing payslip to preserve manual entries + deliverables
  const { data: existing } = await supabase
    .from("payslips")
    .select("*")
    .eq("user_id", userId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (existing && existing.status === "finalized") {
    return { error: "This payslip is already finalized. Reopen it first to recalculate." };
  }

  // Load existing deliverables so we can recompute the deliverables pay
  let deliverablesAchievementPct = 0;
  let deliverablesPay = 0;
  if (includesDeliverables && existing) {
    const { data: rows } = await supabase
      .from("payslip_deliverables")
      .select("target, realization, weight_pct")
      .eq("payslip_id", existing.id);
    deliverablesAchievementPct = computeDeliverablesAchievement(rows ?? []);
    deliverablesPay = Math.round((deliverablesAchievementPct / 100) * baseSalary);
  }

  // Auto-detect pinjaman karyawan dari cashflow_transactions: ambil
  // semua debit di bulan target yang description / notes match
  // pattern "pinjem" + nickname/first-name karyawan. Override
  // debt_deduction yang sebelumnya manual — auto-calc adalah source
  // of truth supaya tiap recalc nge-pickup pinjaman terbaru.
  const detectedDebt = await detectLoanDebts(supabase, userId, month, year);

  const manualEntries = existing
    ? {
        monthly_bonus: Number(existing.monthly_bonus),
        monthly_bonus_note: existing.monthly_bonus_note,
        debt_deduction: detectedDebt.total,
        debt_deduction_note: detectedDebt.note,
        other_penalty: Number(existing.other_penalty),
        other_penalty_note: existing.other_penalty_note,
      }
    : {
        monthly_bonus: 0,
        monthly_bonus_note: null,
        debt_deduction: detectedDebt.total,
        debt_deduction_note: detectedDebt.note,
        other_penalty: 0,
        other_penalty_note: null,
      };

  const netTotal = computeNetTotal(
    basis,
    Number(settings.attendance_weight_pct),
    Number(settings.deliverables_weight_pct),
    {
      prorated_salary: attCalc.prorated_salary,
      overtime_pay: attCalc.overtime_pay,
      late_penalty: attCalc.late_penalty,
      deliverables_pay: deliverablesPay,
      monthly_bonus: manualEntries.monthly_bonus,
      debt_deduction: manualEntries.debt_deduction,
      other_penalty: manualEntries.other_penalty,
      extra_work_pay: extraWorkPay,
      base_salary: baseSalary,
    }
  );

  const { breakdown: attBreakdown, ...attFields } = attCalc;
  // Merge the extra-work breakdown alongside attendance details so the
  // payslip detail view can render a single consolidated breakdown.
  const breakdownToStore: PayslipBreakdown | null =
    includesAttendance || extraWorkDays.length > 0
      ? {
          ...attBreakdown,
          extra_work_days: extraWorkDays,
          // Legacy field — sekarang per-entry pay disimpan di
          // extra_work_days[i].pay; rate aggregate sudah tidak relevan
          // (formula bisa beda per kind/entry). Tetap dipertahankan
          // untuk backward compat dengan UI lama yang masih membaca.
          extra_work_rate_idr: 0,
        }
      : null;
  const calcFields = {
    ...attFields,
    extra_day_bonus: 0,
    deliverables_achievement_pct: Math.round(deliverablesAchievementPct * 100) / 100,
    deliverables_pay: deliverablesPay,
    extra_work_pay: extraWorkPay,
    ...manualEntries,
    net_total: netTotal,
    status: "draft" as const,
    breakdown_json: breakdownToStore,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from("payslips")
      .update(calcFields)
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("payslips")
      .insert({ user_id: userId, month, year, ...calcFields });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/payslips");
  return {};
}

// ---------------------------------------------------------------------------
// Deliverables CRUD (admin only)
// ---------------------------------------------------------------------------

export async function getPayslipDeliverables(payslipId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslip_deliverables")
    .select("*")
    .eq("payslip_id", payslipId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return data ?? [];
}

/**
 * Replace the full deliverables list for a payslip. Recalculates the
 * payslip totals afterwards so UI stays in sync.
 */
export async function saveDeliverables(
  payslipId: string,
  rows: Array<{ id?: string; name: string; target: number; realization: number; weight_pct: number }>
): Promise<{ error?: string }> {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();

  const { data: payslip } = await supabase
    .from("payslips")
    .select("id, user_id, month, year, status")
    .eq("id", payslipId)
    .single();

  if (!payslip) return { error: "Payslip not found." };
  if (payslip.status === "finalized") return { error: "Reopen the payslip before editing deliverables." };

  // Validate
  for (const r of rows) {
    if (!r.name.trim()) return { error: "Each deliverable needs a name." };
    if (r.target < 0 || r.realization < 0 || r.weight_pct < 0) {
      return { error: "Target, realization, and weight cannot be negative." };
    }
  }

  // Wipe and re-insert (simpler than diffing). sort_order preserved by array index.
  const { error: delErr } = await supabase
    .from("payslip_deliverables")
    .delete()
    .eq("payslip_id", payslipId);
  if (delErr) return { error: delErr.message };

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("payslip_deliverables").insert(
      rows.map((r, i) => ({
        payslip_id: payslipId,
        name: r.name.trim(),
        target: r.target,
        realization: r.realization,
        weight_pct: r.weight_pct,
        sort_order: i,
      }))
    );
    if (insErr) return { error: insErr.message };
  }

  // Recalc the payslip so totals reflect new deliverables
  const recalc = await calculatePayslip(payslip.user_id, payslip.month, payslip.year);
  if (recalc.error) return recalc;

  revalidatePath("/admin/payslips");
  return {};
}

// ---------------------------------------------------------------------------
// Manual Entries + Finalize
// ---------------------------------------------------------------------------

export async function updatePayslipManualEntries(
  payslipId: string,
  fields: {
    monthly_bonus?: number;
    monthly_bonus_note?: string | null;
    debt_deduction?: number;
    other_penalty?: number;
    other_penalty_note?: string | null;
  }
) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();

  // Get existing to recalculate net
  const { data: existing } = await supabase
    .from("payslips")
    .select("*")
    .eq("id", payslipId)
    .single();

  if (!existing) return { error: "Payslip not found." };
  if (existing.status === "finalized") return { error: "Cannot edit a finalized payslip." };

  const merged = {
    monthly_bonus: fields.monthly_bonus ?? Number(existing.monthly_bonus),
    debt_deduction: fields.debt_deduction ?? Number(existing.debt_deduction),
    other_penalty: fields.other_penalty ?? Number(existing.other_penalty),
  };

  // Need settings to know basis + weights
  const { data: settings } = await supabase
    .from("payslip_settings")
    .select("calculation_basis, attendance_weight_pct, deliverables_weight_pct")
    .eq("user_id", existing.user_id)
    .single();

  const netTotal = computeNetTotal(
    (settings?.calculation_basis ?? "presence") as
      | "presence"
      | "deliverables"
      | "both"
      | "fixed",
    Number(settings?.attendance_weight_pct ?? 100),
    Number(settings?.deliverables_weight_pct ?? 0),
    {
      prorated_salary: Number(existing.prorated_salary),
      overtime_pay: Number(existing.overtime_pay),
      late_penalty: Number(existing.late_penalty),
      deliverables_pay: Number(existing.deliverables_pay),
      // Preserve previously-calculated extra-work pay across manual
      // updates — only `calculatePayslip` recomputes it from the logs.
      extra_work_pay: Number(existing.extra_work_pay ?? 0),
      base_salary: Number(existing.base_salary ?? 0),
      ...merged,
    }
  );

  const { error } = await supabase
    .from("payslips")
    .update({
      ...fields,
      net_total: netTotal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payslipId);

  if (error) return { error: error.message };

  revalidatePath("/admin/payslips");
  return {};
}

export async function finalizePayslip(payslipId: string) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();
  const { error } = await supabase
    .from("payslips")
    .update({ status: "finalized", updated_at: new Date().toISOString() })
    .eq("id", payslipId);

  if (error) return { error: error.message };

  revalidatePath("/admin/payslips");
  return {};
}

/**
 * Reopen a finalized payslip so admin can recalculate and revise it.
 * Moves status back to 'draft'. Employee will no longer see it in their
 * finalized history until it's finalized again.
 */
export async function reopenPayslip(payslipId: string) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();
  const { error } = await supabase
    .from("payslips")
    .update({ status: "draft", updated_at: new Date().toISOString() })
    .eq("id", payslipId);

  if (error) return { error: error.message };

  revalidatePath("/admin/payslips");
  revalidatePath("/payslips");
  return {};
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getPayslip(userId: string, month: number, year: number) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslips")
    .select("*")
    .eq("user_id", userId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();
  return data;
}

export async function getAllPayslipSummaries(month: number, year: number) {
  const role = await getCurrentRole();
  adminGuard(role);

  const supabase = await createClient();

  // Get all employees — exclude payslip-deactivated ones (admin
  // toggle di /admin/users) supaya admin tidak lihat row kosong.
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("payslip_excluded", false)
    .order("full_name");

  // Get all settings
  const { data: allSettings } = await supabase
    .from("payslip_settings")
    .select("user_id, is_finalized");

  // Get payslips for this month
  const { data: payslips } = await supabase
    .from("payslips")
    .select("*")
    .eq("month", month)
    .eq("year", year);

  const settingsMap = new Map(
    (allSettings ?? []).map((s) => [s.user_id, s])
  );
  const payslipMap = new Map(
    (payslips ?? []).map((p) => [p.user_id, p])
  );

  return (employees ?? []).map((emp) => ({
    ...emp,
    settings: settingsMap.get(emp.id) ?? null,
    payslip: payslipMap.get(emp.id) ?? null,
  }));
}

export async function getEmployeePayslips(userId: string) {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("payslips")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "finalized")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  return data ?? [];
}

// ---------------------------------------------------------------------------
// Bulk per-variable editors (lintas karyawan dalam satu request)
// ---------------------------------------------------------------------------

type BulkSettingsRow = {
  userId: string;
  fields: Partial<
    Omit<PayslipSettings, "id" | "user_id" | "created_at" | "updated_at">
  >;
};

/**
 * Bulk-upsert payslip_settings untuk banyak karyawan sekaligus —
 * dipakai di /admin/payslips/variables saat admin edit satu variabel
 * lintas karyawan. Karyawan yang belum punya settings di-create
 * sebagai draft otomatis (is_finalized=false).
 */
export async function bulkUpsertPayslipSettings(
  rows: BulkSettingsRow[]
): Promise<{ updatedCount: number; error?: string }> {
  const role = await getCurrentRole();
  adminGuard(role);

  if (!Array.isArray(rows) || rows.length === 0) return { updatedCount: 0 };

  const supabase = await createClient();
  const userIds = rows.map((r) => r.userId);
  const { data: existingSettings } = await supabase
    .from("payslip_settings")
    .select("user_id")
    .in("user_id", userIds);
  const haveSettings = new Set(
    (existingSettings ?? []).map((s) => s.user_id)
  );

  const now = new Date().toISOString();
  let updatedCount = 0;
  for (const row of rows) {
    if (haveSettings.has(row.userId)) {
      const { error } = await supabase
        .from("payslip_settings")
        .update({ ...row.fields, updated_at: now })
        .eq("user_id", row.userId);
      if (error) return { updatedCount, error: error.message };
    } else {
      // Auto-finalize on insert — admin tidak butuh langkah finalize
      // terpisah; setting dianggap usable begitu di-save (gate finalize
      // di calculatePayslip masih ada sebagai defensive).
      const { error } = await supabase
        .from("payslip_settings")
        .insert({
          user_id: row.userId,
          is_finalized: true,
          finalized_at: now,
          ...row.fields,
        });
      if (error) return { updatedCount, error: error.message };
    }
    updatedCount += 1;
  }

  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  return { updatedCount };
}

type BulkMonthlyRow = {
  userId: string;
  fields: {
    monthly_bonus?: number;
    monthly_bonus_note?: string | null;
    debt_deduction?: number;
    other_penalty?: number;
    other_penalty_note?: string | null;
  };
};

/**
 * Bulk-update manual entries (bonus / debt / penalty) di payslip
 * bulan tertentu untuk banyak karyawan. Karyawan yang belum punya
 * payslip untuk bulan itu di-skip (admin perlu Calculate dulu di
 * overview page) — disurface via `skipped` di response.
 */
export async function bulkUpdateMonthlyEntries(
  month: number,
  year: number,
  rows: BulkMonthlyRow[]
): Promise<{
  updatedCount: number;
  skippedUserIds: string[];
  error?: string;
}> {
  const role = await getCurrentRole();
  adminGuard(role);

  if (!Array.isArray(rows) || rows.length === 0) {
    return { updatedCount: 0, skippedUserIds: [] };
  }

  let updatedCount = 0;
  const skippedUserIds: string[] = [];
  for (const row of rows) {
    const supabase = await createClient();
    const { data: payslip } = await supabase
      .from("payslips")
      .select("id")
      .eq("user_id", row.userId)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();
    if (!payslip) {
      skippedUserIds.push(row.userId);
      continue;
    }
    const res = await updatePayslipManualEntries(payslip.id, row.fields);
    if (res.error) return { updatedCount, skippedUserIds, error: res.error };
    updatedCount += 1;
  }

  revalidatePath("/admin/payslips");
  revalidatePath("/admin/payslips/variables");
  return { updatedCount, skippedUserIds };
}
