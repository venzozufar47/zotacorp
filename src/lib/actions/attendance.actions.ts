"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTodayDateString } from "@/lib/utils/date";
import { getAttendanceSettings } from "./settings.actions";

interface CheckInPayload {
  latitude: number | null;
  longitude: number | null;
}

/**
 * Compute the attendance status at check-in time using per-user settings.
 */
function computeCheckInStatus(
  checkedInAt: Date,
  userSettings: {
    work_start_time: string;
    grace_period_min: number;
  },
  timezone: string,
  isFlexible: boolean
): { status: "on_time" | "late" | "flexible" | "unknown"; late_minutes: number } {
  if (isFlexible) {
    return { status: "flexible", late_minutes: 0 };
  }

  try {
    // Convert check-in time to configured timezone
    const checkinLocal = new Date(
      checkedInAt.toLocaleString("en-US", { timeZone: timezone })
    );

    // Parse work_start_time (e.g. "09:00" or "09:00:00")
    const [startH, startM] = userSettings.work_start_time.split(":").map(Number);

    // Cutoff = work_start_time + grace_period_min
    const cutoff = new Date(checkinLocal);
    cutoff.setHours(startH, startM + userSettings.grace_period_min, 0, 0);

    // Exact start time for late_minutes
    const startTime = new Date(checkinLocal);
    startTime.setHours(startH, startM, 0, 0);

    if (checkinLocal <= cutoff) {
      return { status: "on_time", late_minutes: 0 };
    }

    const lateMs = checkinLocal.getTime() - startTime.getTime();
    const lateMinutes = Math.ceil(lateMs / 60_000);

    return { status: "late", late_minutes: lateMinutes };
  } catch {
    return { status: "unknown", late_minutes: 0 };
  }
}

export async function checkIn(payload: CheckInPayload) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const today = getTodayDateString();

  const { data: existing } = await supabase
    .from("attendance_logs")
    .select("id, checked_in_at, checked_out_at")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();

  if (existing) {
    if (!existing.checked_out_at) {
      return { error: "You are already checked in. Please check out first." };
    }
    return { error: "You have already completed attendance for today." };
  }

  // Get profile for per-user working time settings
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_flexible_schedule, work_start_time, work_end_time, grace_period_min")
    .eq("id", user.id)
    .single();

  // Get global timezone
  const settings = await getAttendanceSettings();
  const timezone = settings?.timezone ?? "Asia/Jakarta";

  const now = new Date();
  const { status, late_minutes } = profile
    ? computeCheckInStatus(
        now,
        {
          work_start_time: profile.work_start_time,
          grace_period_min: profile.grace_period_min,
        },
        timezone,
        profile.is_flexible_schedule
      )
    : { status: "unknown" as const, late_minutes: 0 };

  const { data, error } = await supabase
    .from("attendance_logs")
    .insert({
      user_id: user.id,
      date: today,
      checked_in_at: now.toISOString(),
      latitude: payload.latitude,
      longitude: payload.longitude,
      status,
      late_minutes,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "You have already completed attendance for today." };
    }
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  return { data };
}

interface CheckOutPayload {
  isOvertime?: boolean;
  overtimeReason?: string;
}

export async function checkOut(payload?: CheckOutPayload) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const today = getTodayDateString();

  const { data: existing } = await supabase
    .from("attendance_logs")
    .select("id, checked_out_at, checked_in_at")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();

  if (!existing) {
    return { error: "No check-in found for today." };
  }

  if (existing.checked_out_at) {
    return { error: "You have already checked out today." };
  }

  const now = new Date();
  const isOvertime = payload?.isOvertime ?? false;
  const overtimeReason = payload?.overtimeReason ?? "";

  // Get per-user settings
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_flexible_schedule, work_end_time")
    .eq("id", user.id)
    .single();

  let overtimeMinutes = 0;

  if (isOvertime && !profile?.is_flexible_schedule) {
    const settings = await getAttendanceSettings();
    const timezone = settings?.timezone ?? "Asia/Jakarta";

    try {
      const checkoutLocal = new Date(
        now.toLocaleString("en-US", { timeZone: timezone })
      );
      const [endH, endM] = (profile?.work_end_time ?? "18:00").split(":").map(Number);
      const endTime = new Date(checkoutLocal);
      endTime.setHours(endH, endM, 0, 0);

      if (checkoutLocal > endTime) {
        overtimeMinutes = Math.ceil(
          (checkoutLocal.getTime() - endTime.getTime()) / 60_000
        );
        overtimeMinutes = Math.min(overtimeMinutes, 480);
      }
    } catch {
      // Fallback: no overtime
    }
  }

  const { data, error } = await supabase
    .from("attendance_logs")
    .update({
      checked_out_at: now.toISOString(),
      is_overtime: isOvertime && overtimeMinutes > 0,
      overtime_minutes: isOvertime ? overtimeMinutes : 0,
      overtime_status: isOvertime && overtimeMinutes > 0 ? "pending" : null,
      updated_at: now.toISOString(),
    })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) return { error: error.message };

  // If overtime was claimed, create an overtime request
  if (isOvertime && overtimeMinutes > 0 && data) {
    await supabase.from("overtime_requests").insert({
      attendance_log_id: data.id,
      user_id: user.id,
      date: today,
      overtime_minutes: overtimeMinutes,
      reason: overtimeReason || "No reason provided",
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  return { data };
}

export async function getTodayAttendance() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", getTodayDateString())
    .maybeSingle();

  return data;
}

export async function getMyAttendanceLogs(limit = 30) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(limit);

  return data ?? [];
}

export async function getAllAttendanceLogs(params: {
  startDate?: string;
  endDate?: string;
  userId?: string;
  statusFilter?: string;
  page?: number;
  pageSize?: number;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: [], count: 0 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { data: [], count: 0 };

  const {
    startDate,
    endDate,
    userId,
    statusFilter,
    page = 1,
    pageSize = 25,
  } = params;

  let query = supabase
    .from("attendance_logs")
    .select(
      `
      *,
      profiles!inner(full_name, email)
    `,
      { count: "exact" }
    )
    .order("date", { ascending: false })
    .order("checked_in_at", { ascending: false });

  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);
  if (userId) query = query.eq("user_id", userId);
  if (statusFilter && statusFilter !== "all")
    query = query.eq("status", statusFilter as "on_time" | "late" | "late_excused" | "flexible" | "unknown");

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) return { data: [], count: 0 };
  return { data: data ?? [], count: count ?? 0 };
}

export async function getMyAttendanceSummary(month: number, year: number) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: logs } = await supabase
    .from("attendance_logs")
    .select("checked_in_at, checked_out_at, status, late_minutes, is_overtime, overtime_minutes, overtime_status")
    .eq("user_id", user.id)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: false });

  if (!logs) return null;

  let totalWorkingMs = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let lateExcusedCount = 0;
  let flexibleCount = 0;
  let approvedOvertimeMinutes = 0;

  for (const log of logs) {
    if (log.checked_out_at) {
      totalWorkingMs +=
        new Date(log.checked_out_at).getTime() -
        new Date(log.checked_in_at).getTime();
    }

    switch (log.status) {
      case "on_time":
        onTimeCount++;
        break;
      case "late":
        lateCount++;
        break;
      case "late_excused":
        lateExcusedCount++;
        break;
      case "flexible":
        flexibleCount++;
        break;
    }

    if (log.overtime_status === "approved" && log.overtime_minutes > 0) {
      approvedOvertimeMinutes += log.overtime_minutes;
    }
  }

  const totalWorkingHours = Math.round((totalWorkingMs / 3_600_000) * 10) / 10;

  return {
    totalWorkingHours,
    onTimeCount,
    lateCount,
    lateExcusedCount,
    flexibleCount,
    approvedOvertimeMinutes,
    totalDays: logs.length,
  };
}

/** Get all employee profiles (id + name) for admin dropdown filters */
export async function getAllEmployees() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name", { ascending: true });

  return data ?? [];
}
