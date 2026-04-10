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
 * Compute the attendance status at check-in time.
 * Compares the check-in time against work_start_time + grace_period using
 * the configured timezone.
 */
function computeCheckInStatus(
  checkedInAt: Date,
  settings: {
    work_start_time: string;
    work_end_time: string;
    grace_period_min: number;
    working_days: number[];
    timezone: string;
  },
  isFlexible: boolean
): { status: "on_time" | "late" | "flexible" | "unknown"; late_minutes: number } {
  if (isFlexible) {
    return { status: "flexible", late_minutes: 0 };
  }

  try {
    // Convert check-in time to configured timezone
    const checkinLocal = new Date(
      checkedInAt.toLocaleString("en-US", { timeZone: settings.timezone })
    );

    // Check if today is a working day (ISO: 1=Mon..7=Sun)
    const dayOfWeek = checkinLocal.getDay(); // JS: 0=Sun..6=Sat
    const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to ISO

    if (!settings.working_days.includes(isoDay)) {
      // Non-working day — no late penalty
      return { status: "on_time", late_minutes: 0 };
    }

    // Parse work_start_time (e.g. "09:00" or "09:00:00")
    const [startH, startM] = settings.work_start_time.split(":").map(Number);

    // Create cutoff time = work_start_time + grace_period_min
    const cutoff = new Date(checkinLocal);
    cutoff.setHours(startH, startM + settings.grace_period_min, 0, 0);

    // Create exact start time for late_minutes calculation
    const startTime = new Date(checkinLocal);
    startTime.setHours(startH, startM, 0, 0);

    if (checkinLocal <= cutoff) {
      return { status: "on_time", late_minutes: 0 };
    }

    // Late: minutes measured from work_start_time, not from cutoff
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

  // Check for existing record today
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

  // Get profile for flexible schedule flag
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_flexible_schedule")
    .eq("id", user.id)
    .single();

  // Get attendance settings
  const settings = await getAttendanceSettings();

  const now = new Date();
  const { status, late_minutes } = settings
    ? computeCheckInStatus(now, settings, profile?.is_flexible_schedule ?? false)
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

  // Get profile for flexible schedule flag
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_flexible_schedule")
    .eq("id", user.id)
    .single();

  let overtimeMinutes = 0;

  if (isOvertime && !profile?.is_flexible_schedule) {
    // Get settings to compute overtime
    const settings = await getAttendanceSettings();
    if (settings) {
      try {
        const checkoutLocal = new Date(
          now.toLocaleString("en-US", { timeZone: settings.timezone })
        );
        const [endH, endM] = settings.work_end_time.split(":").map(Number);
        const endTime = new Date(checkoutLocal);
        endTime.setHours(endH, endM, 0, 0);

        if (checkoutLocal > endTime) {
          overtimeMinutes = Math.ceil(
            (checkoutLocal.getTime() - endTime.getTime()) / 60_000
          );
          // Cap at 8 hours (480 minutes)
          overtimeMinutes = Math.min(overtimeMinutes, 480);
        }
      } catch {
        // Fallback: no overtime
      }
    }
  }

  const { data, error } = await supabase
    .from("attendance_logs")
    .update({
      checked_out_at: now.toISOString(),
      is_overtime: isOvertime && overtimeMinutes > 0,
      overtime_minutes: isOvertime ? overtimeMinutes : 0,
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
  search?: string;
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
    search,
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
  if (search)
    query = query.ilike("profiles.full_name", `%${search}%`);
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

  // Build date range for the month
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: logs } = await supabase
    .from("attendance_logs")
    .select("checked_in_at, checked_out_at, status, late_minutes, is_overtime, overtime_minutes")
    .eq("user_id", user.id)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: false });

  if (!logs) return null;

  // Get approved overtime totals
  const { data: overtimeData } = await supabase
    .from("overtime_requests")
    .select("overtime_minutes, status")
    .eq("user_id", user.id)
    .gte("date", startDate)
    .lte("date", endDate)
    .eq("status", "approved");

  let totalWorkingMs = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let lateExcusedCount = 0;
  let flexibleCount = 0;

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
  }

  const totalWorkingHours = Math.round((totalWorkingMs / 3_600_000) * 10) / 10;
  const approvedOvertimeMinutes = (overtimeData ?? []).reduce(
    (sum, r) => sum + r.overtime_minutes,
    0
  );
  const approvedOvertimeHours =
    Math.round((approvedOvertimeMinutes / 60) * 10) / 10;

  return {
    totalWorkingHours,
    onTimeCount,
    lateCount,
    lateExcusedCount,
    flexibleCount,
    approvedOvertimeHours,
    totalDays: logs.length,
  };
}
