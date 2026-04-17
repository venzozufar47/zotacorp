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
function resolveExpectedWorkDays(
  settings: PayslipSettings,
  month: number,
  year: number
): number {
  const mode = settings.expected_days_mode ?? "manual";
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
  const proratedSalary = expected > 0
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
  basis: "presence" | "deliverables" | "both",
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
  }
): number {
  const attendanceBucket =
    fields.prorated_salary + fields.overtime_pay - fields.late_penalty;
  const deliverablesBucket = fields.deliverables_pay;

  let combined = 0;
  if (basis === "presence") {
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

  const basis = settings.calculation_basis as "presence" | "deliverables" | "both";
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

  // Extra-work pay: count entries × per-employee rate. Independent of
  // calculation_basis — these are discrete tasks outside the regular
  // schedule, so they earn flat regardless of presence/deliverables mix.
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const extraWorkRate = Number(settings.extra_work_rate_idr ?? 0);
  let extraWorkPay = 0;
  const extraWorkDays: NonNullable<PayslipBreakdown["extra_work_days"]> = [];
  if (extraWorkRate > 0) {
    const { data: ewLogs } = await supabase
      .from("extra_work_logs")
      .select("date, kind")
      .eq("user_id", userId)
      .gte("date", startDate)
      .lt("date", endDate);
    for (const row of ewLogs ?? []) {
      extraWorkDays.push({ date: row.date, kind: row.kind, pay: extraWorkRate });
      extraWorkPay += extraWorkRate;
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

  const manualEntries = existing
    ? {
        monthly_bonus: Number(existing.monthly_bonus),
        monthly_bonus_note: existing.monthly_bonus_note,
        debt_deduction: Number(existing.debt_deduction),
        other_penalty: Number(existing.other_penalty),
        other_penalty_note: existing.other_penalty_note,
      }
    : {
        monthly_bonus: 0,
        monthly_bonus_note: null,
        debt_deduction: 0,
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
          extra_work_rate_idr: extraWorkRate,
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
    (settings?.calculation_basis ?? "presence") as "presence" | "deliverables" | "both",
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

  // Get all employees
  const { data: employees } = await supabase
    .from("profiles")
    .select("id, full_name, email")
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
