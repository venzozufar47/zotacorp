"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import type { PayslipSettings, AttendanceLog, OvertimeRequest } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adminGuard(role: string | null) {
  if (role !== "admin") throw new Error("Forbidden");
}

/** Pure calculation: compute payslip fields from attendance + settings */
function calculateFromAttendance(
  settings: PayslipSettings,
  logs: Pick<AttendanceLog, "checked_out_at" | "overtime_minutes" | "overtime_status" | "late_minutes" | "status" | "is_overtime">[],
  overtimeRequests: Pick<OvertimeRequest, "attendance_log_id" | "overtime_minutes" | "status">[],
  gracePeriodMin: number = 0
) {
  const completedLogs = logs.filter((l) => l.checked_out_at);
  const actualWorkDays = completedLogs.length;
  const expected = settings.expected_work_days;
  const baseSalary = Number(settings.monthly_fixed_amount);

  // Prorate
  const proratedSalary = expected > 0
    ? Math.round((actualWorkDays / expected) * baseSalary)
    : 0;

  // Extra day bonus (worked more than expected)
  const extraDayBonus = actualWorkDays > expected && expected > 0
    ? Math.round(((actualWorkDays - expected) / expected) * baseSalary)
    : 0;

  // Overtime — only count approved
  const approvedOtSet = new Set(
    overtimeRequests.filter((r) => r.status === "approved").map((r) => r.attendance_log_id)
  );
  let totalOvertimeMinutes = 0;
  let overtimePay = 0;

  if (settings.overtime_mode === "hourly_tiered") {
    for (const log of completedLogs) {
      if (!log.is_overtime || log.overtime_minutes <= 0) continue;
      // Only count if approved via overtime_requests or overtime_status = approved
      if (log.overtime_status !== "approved") continue;
      const mins = log.overtime_minutes;
      totalOvertimeMinutes += mins;
      const hours = mins / 60;
      const firstHour = Math.min(hours, 1);
      const nextHours = Math.max(hours - 1, 0);
      overtimePay += Math.round(
        firstHour * Number(settings.ot_first_hour_rate) +
        nextHours * Number(settings.ot_next_hour_rate)
      );
    }
  } else {
    // fixed_per_day
    let otDays = 0;
    for (const log of completedLogs) {
      if (!log.is_overtime || log.overtime_minutes <= 0) continue;
      if (log.overtime_status !== "approved") continue;
      totalOvertimeMinutes += log.overtime_minutes;
      otDays++;
    }
    overtimePay = Math.round(otDays * Number(settings.ot_fixed_daily_rate));
  }

  // Late penalty — exclude excused
  // Display: raw late_minutes (from standard sign-in time)
  // Penalty: late_minutes minus grace period (penalized portion only)
  let totalLateMinutes = 0; // raw display value
  let penalizedLateMinutes = 0; // for penalty calculation
  let latePenalty = 0;
  let lateDays = 0;

  for (const log of completedLogs) {
    if (log.status === "late" && log.late_minutes > 0) {
      totalLateMinutes += log.late_minutes;
      const penalized = Math.max(log.late_minutes - gracePeriodMin, 0);
      if (penalized > 0) {
        penalizedLateMinutes += penalized;
        lateDays++;
      }
    }
  }

  if (settings.late_penalty_mode === "per_minutes" && settings.late_penalty_interval_min > 0) {
    const intervals = Math.floor(penalizedLateMinutes / settings.late_penalty_interval_min);
    latePenalty = Math.round(intervals * Number(settings.late_penalty_amount));
  } else if (settings.late_penalty_mode === "per_day") {
    latePenalty = Math.round(lateDays * Number(settings.late_penalty_amount));
  }

  return {
    actual_work_days: actualWorkDays,
    expected_work_days: expected,
    base_salary: baseSalary,
    prorated_salary: proratedSalary,
    extra_day_bonus: extraDayBonus,
    total_overtime_minutes: totalOvertimeMinutes,
    overtime_pay: overtimePay,
    total_late_minutes: totalLateMinutes,
    late_penalty: latePenalty,
  };
}

function computeNetTotal(fields: {
  prorated_salary: number;
  extra_day_bonus: number;
  overtime_pay: number;
  late_penalty: number;
  monthly_bonus: number;
  debt_deduction: number;
  other_penalty: number;
}) {
  return (
    fields.prorated_salary +
    fields.extra_day_bonus +
    fields.overtime_pay -
    fields.late_penalty +
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

  // Get employee's grace period
  const { data: profile } = await supabase
    .from("profiles")
    .select("grace_period_min")
    .eq("id", userId)
    .single();
  const gracePeriodMin = profile?.grace_period_min ?? 0;

  // Get attendance logs for the month
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const { data: logs } = await supabase
    .from("attendance_logs")
    .select("id, checked_out_at, overtime_minutes, overtime_status, late_minutes, status, is_overtime")
    .eq("user_id", userId)
    .gte("date", startDate)
    .lt("date", endDate);

  // Get overtime requests for those logs
  const logIds = (logs ?? []).map((l) => l.id);
  let overtimeRequests: Pick<OvertimeRequest, "attendance_log_id" | "overtime_minutes" | "status">[] = [];
  if (logIds.length > 0) {
    const { data: otReqs } = await supabase
      .from("overtime_requests")
      .select("attendance_log_id, overtime_minutes, status")
      .in("attendance_log_id", logIds);
    overtimeRequests = otReqs ?? [];
  }

  const calc = calculateFromAttendance(settings, logs ?? [], overtimeRequests, gracePeriodMin);

  // Check existing payslip to preserve manual entries
  const { data: existing } = await supabase
    .from("payslips")
    .select("*")
    .eq("user_id", userId)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  if (existing && existing.status === "finalized") {
    return { error: "This payslip is already finalized. Cannot recalculate." };
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

  const netTotal = computeNetTotal({
    ...calc,
    monthly_bonus: manualEntries.monthly_bonus,
    debt_deduction: manualEntries.debt_deduction,
    other_penalty: manualEntries.other_penalty,
  });

  const calcFields = {
    ...calc,
    ...manualEntries,
    net_total: netTotal,
    status: "draft" as const,
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

  const netTotal = computeNetTotal({
    prorated_salary: Number(existing.prorated_salary),
    extra_day_bonus: Number(existing.extra_day_bonus),
    overtime_pay: Number(existing.overtime_pay),
    late_penalty: Number(existing.late_penalty),
    ...merged,
  });

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
