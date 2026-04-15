"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getCurrentRole,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import { getTodayDateString } from "@/lib/utils/date";
import { notifyAdminAttendance } from "@/lib/whatsapp/attendance-notify";
import { evaluateCheckIn, evaluateCheckOut } from "@/lib/location/enforce";

interface CheckInPayload {
  latitude: number | null;
  longitude: number | null;
  /** Storage path under the `attendance-selfies` bucket. Required: a check-in
   *  without a live selfie is rejected server-side. Client uploads to storage
   *  before calling this action and passes the resulting path. */
  selfie_path: string;
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
    const lateMinutes = Math.floor(lateMs / 60_000);

    return { status: "late", late_minutes: lateMinutes };
  } catch {
    return { status: "unknown", late_minutes: 0 };
  }
}

export async function checkIn(payload: CheckInPayload) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  if (payload.latitude == null || payload.longitude == null) {
    return { error: "Location is required to check in. Please enable location access in your browser settings." };
  }

  if (!payload.selfie_path?.trim()) {
    return { error: "Foto selfie wajib diambil sebelum check in." };
  }

  // Defensive: ensure the submitted path actually lives under the
  // employee's own folder. Storage RLS also enforces this, but catching
  // it here avoids committing an attendance row that references a file
  // the caller had no business uploading.
  if (!payload.selfie_path.startsWith(`${user.id}/`)) {
    return { error: "Selfie path tidak valid." };
  }

  // Geofence enforcement: assigned employees must be inside one of their
  // allowed radii. Unassigned employees pass freely.
  const decision = await evaluateCheckIn(user.id, payload.latitude, payload.longitude);
  if (!decision.ok) {
    return { error: decision.error ?? "Tidak diizinkan check in dari lokasi ini." };
  }

  const supabase = await createClient();
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

  // Get profile for per-user working time settings + name (used in WA notify)
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_flexible_schedule, work_start_time, work_end_time, grace_period_min")
    .eq("id", user.id)
    .single();

  // Get global timezone
  const settings = await getCachedAttendanceSettings();
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
      matched_location_id: decision.matchedLocationId,
      selfie_path: payload.selfie_path,
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

  // Notify admin WA(s) after the response is sent so attendance latency
  // isn't tied to Fonnte's round-trip. Failures are swallowed in fonnte.ts.
  after(() =>
    notifyAdminAttendance({
      employeeId: user.id,
      fullName: profile?.full_name ?? "Karyawan",
      event: "in",
      at: now.toISOString(),
      latitude: payload.latitude,
      longitude: payload.longitude,
      timezone,
    })
  );

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  return { data };
}

// ---------------------------------------------------------------------------
// Admin: Review late proof (accept/reject)
// ---------------------------------------------------------------------------

export async function reviewLateProof(
  logId: string,
  decision: "approved" | "rejected",
  adminNote?: string
) {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  if (decision === "rejected" && !adminNote?.trim()) {
    return { error: "A rejection reason is required." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("attendance_logs")
    .update({
      late_proof_status: decision,
      late_proof_admin_note: adminNote?.trim() || null,
      ...(decision === "approved" ? { status: "late_excused" as const } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", logId);

  if (error) return { error: error.message };

  revalidatePath("/admin/attendance");
  revalidatePath("/attendance");
  return {};
}

interface CheckOutPayload {
  isOvertime?: boolean;
  overtimeReason?: string;
  /** Fresh GPS captured at the moment of checkout (not the check-in coords). */
  latitude?: number | null;
  longitude?: number | null;
  /** Required when employee is outside all assigned geofences. */
  outsideLocationNote?: string;
}

export async function checkOut(payload?: CheckOutPayload) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const today = getTodayDateString();

  const { data: existing } = await supabase
    .from("attendance_logs")
    .select("id, checked_out_at, checked_in_at, latitude, longitude")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();

  if (!existing) {
    return { error: "No check-in found for today." };
  }

  if (existing.checked_out_at) {
    return { error: "You have already checked out today." };
  }

  // Geofence soft-check: outside-radius requires a note from the employee.
  // Returning `requiresNote: true` lets the client open a note prompt and
  // resubmit without fully reloading.
  const checkoutLat = payload?.latitude ?? null;
  const checkoutLng = payload?.longitude ?? null;
  const note = payload?.outsideLocationNote?.trim() || null;
  const decision = await evaluateCheckOut(user.id, checkoutLat, checkoutLng, note);
  if (!decision.ok) {
    return {
      error: decision.error ?? "Catatan diperlukan untuk check out di luar lokasi.",
      requiresNote: decision.requiresNote,
    };
  }

  const now = new Date();
  const isOvertime = payload?.isOvertime ?? false;
  const overtimeReason = payload?.overtimeReason ?? "";

  // Get per-user settings + name (used in WA notify)
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_flexible_schedule, work_end_time")
    .eq("id", user.id)
    .single();

  let overtimeMinutes = 0;

  if (isOvertime && !profile?.is_flexible_schedule) {
    const settings = await getCachedAttendanceSettings();
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
      checkout_latitude: checkoutLat,
      checkout_longitude: checkoutLng,
      checkout_outside_note: note,
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

  // Notify admin WA(s) using the FRESH checkout GPS — falls back to the
  // check-in coords if the client didn't send any (defensive; geo can
  // legitimately fail mid-day).
  after(() =>
    notifyAdminAttendance({
      employeeId: user.id,
      fullName: profile?.full_name ?? "Karyawan",
      event: "out",
      at: now.toISOString(),
      latitude: checkoutLat ?? existing.latitude,
      longitude: checkoutLng ?? existing.longitude,
      outsideNote: note,
    })
  );

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  return { data };
}

// ---------------------------------------------------------------------------
// Admin: Delete attendance record
// ---------------------------------------------------------------------------

export async function deleteAttendanceLog(logId: string) {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  const supabase = await createClient();

  // Delete related overtime requests first
  await supabase.from("overtime_requests").delete().eq("attendance_log_id", logId);

  const { error } = await supabase
    .from("attendance_logs")
    .delete()
    .eq("id", logId);

  if (error) return { error: error.message };

  revalidatePath("/admin/attendance");
  return {};
}

/**
 * Batch-delete attendance logs. Cascades overtime_requests cleanup by id.
 * Caps the batch at 500 ids to keep the in-query array size sane — the UI
 * has a page size of 25, so in practice the selection rarely approaches
 * the cap.
 */
export async function deleteAttendanceLogsBulk(logIds: string[]) {
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden", deleted: 0 };

  const ids = Array.from(new Set(logIds.filter(Boolean)));
  if (ids.length === 0) return { error: "No records selected", deleted: 0 };
  if (ids.length > 500) return { error: "Too many records selected (max 500)", deleted: 0 };

  const supabase = await createClient();

  // Clean dependents first — FK isn't set to ON DELETE CASCADE on
  // overtime_requests, so we drop them by id rather than rely on the DB.
  await supabase.from("overtime_requests").delete().in("attendance_log_id", ids);

  const { error, count } = await supabase
    .from("attendance_logs")
    .delete({ count: "exact" })
    .in("id", ids);

  if (error) return { error: error.message, deleted: 0 };

  revalidatePath("/admin/attendance");
  return { deleted: count ?? ids.length };
}

// ---------------------------------------------------------------------------
// Late Checkout — fill in missed checkout for a previous day
// ---------------------------------------------------------------------------

interface LateCheckoutPayload {
  attendanceLogId: string;
  checkoutTime: string; // HH:mm format
  reason: string;
  isOvertime?: boolean;
  overtimeReason?: string;
}

export async function lateCheckout(payload: LateCheckoutPayload) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  if (!payload.reason.trim()) {
    return { error: "A reason is required for late checkout." };
  }

  const supabase = await createClient();

  // Verify the log belongs to this user and has no checkout
  const { data: log } = await supabase
    .from("attendance_logs")
    .select("id, user_id, date, checked_in_at, checked_out_at")
    .eq("id", payload.attendanceLogId)
    .single();

  if (!log) return { error: "Attendance record not found." };
  if (log.user_id !== user.id) return { error: "You can only edit your own records." };
  if (log.checked_out_at) return { error: "This record already has a checkout time." };

  // Build checkout datetime from the log's date + provided time
  const [hours, minutes] = payload.checkoutTime.split(":").map(Number);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return { error: "Invalid checkout time." };
  }

  // Resolve timezone so the user's "HH:mm" is interpreted in their local TZ,
  // not the server's UTC. Without this, "07:12" Jakarta gets saved as 07:12 UTC
  // and displays as 14:12 after the +07:00 offset is re-applied.
  const settings = await getCachedAttendanceSettings();
  const timezone = settings?.timezone ?? "Asia/Jakarta";

  const checkinDate = new Date(log.checked_in_at);

  // Find the checkout date (YYYY-MM-DD) in the target TZ, based on check-in moment.
  const dateInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(checkinDate);

  // Convert "YYYY-MM-DDTHH:mm" in target TZ → UTC instant.
  // Trick: parse as if UTC, then measure how far off that moment's TZ wall-clock is,
  // and subtract the offset.
  const assumedUtc = new Date(`${dateInTz}T${payload.checkoutTime}:00Z`);
  const utcWall = new Date(assumedUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzWall = new Date(assumedUtc.toLocaleString("en-US", { timeZone: timezone }));
  const offsetMs = tzWall.getTime() - utcWall.getTime();
  const checkoutDate = new Date(assumedUtc.getTime() - offsetMs);

  // Ensure checkout time is strictly after check-in time (same day, same TZ)
  if (checkoutDate.getTime() <= checkinDate.getTime()) {
    return { error: "Checkout time cannot be the same as or before check-in time." };
  }

  // Compute overtime if requested (same logic as checkOut)
  const isOvertime = payload.isOvertime ?? false;
  const overtimeReason = payload.overtimeReason ?? "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_flexible_schedule, work_end_time")
    .eq("id", user.id)
    .single();

  let overtimeMinutes = 0;

  if (isOvertime && !profile?.is_flexible_schedule) {
    const [endH, endM] = (profile?.work_end_time ?? "18:00").split(":").map(Number);
    const endHm = endH * 60 + endM;
    const checkoutHm = hours * 60 + minutes;

    if (checkoutHm > endHm) {
      overtimeMinutes = Math.min(checkoutHm - endHm, 480);
    }
  }

  const { data, error } = await supabase
    .from("attendance_logs")
    .update({
      checked_out_at: checkoutDate.toISOString(),
      late_checkout_reason: payload.reason.trim(),
      is_overtime: isOvertime && overtimeMinutes > 0,
      overtime_minutes: isOvertime ? overtimeMinutes : 0,
      overtime_status: isOvertime && overtimeMinutes > 0 ? "pending" : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", log.id)
    .select()
    .single();

  if (error) return { error: error.message };

  // If overtime was claimed, create an overtime request
  if (isOvertime && overtimeMinutes > 0 && data) {
    await supabase.from("overtime_requests").insert({
      attendance_log_id: data.id,
      user_id: user.id,
      date: log.date,
      overtime_minutes: overtimeMinutes,
      reason: overtimeReason || "No reason provided",
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  return { data };
}

export async function getTodayAttendance() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", getTodayDateString())
    .maybeSingle();

  return data;
}

export async function getMyAttendanceLogs(limit = 30) {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(limit);

  return data ?? [];
}

/** Whitelisted sort keys for the admin attendance recap. Anything outside
 *  this set falls back to the default (date desc, checked_in_at desc).
 *  Using a foreign-table column for "employee" requires the special
 *  `foreignTable` syntax on `.order()`. */
export type AdminAttendanceSortKey =
  | "date"
  | "checked_in_at"
  | "checked_out_at"
  | "status"
  | "employee";

export async function getAllAttendanceLogs(params: {
  startDate?: string;
  endDate?: string;
  userId?: string;
  statusFilter?: string;
  page?: number;
  pageSize?: number;
  sortBy?: AdminAttendanceSortKey;
  sortDir?: "asc" | "desc";
}) {
  // Cached helpers dedupe against the page's own auth check.
  const role = await getCurrentRole();
  if (role !== "admin") return { data: [], count: 0 };

  const supabase = await createClient();

  const {
    startDate,
    endDate,
    userId,
    statusFilter,
    page = 1,
    pageSize = 25,
    sortBy,
    sortDir = "desc",
  } = params;

  let query = supabase
    .from("attendance_logs")
    .select(
      `
      *,
      profiles!inner(full_name, email)
    `,
      { count: "exact" }
    );

  // Apply sort. When an explicit sortBy lands, use it; otherwise keep the
  // default (newest first + tiebreak by checked_in_at).
  const ascending = sortDir === "asc";
  if (sortBy === "employee") {
    query = query.order("full_name", { referencedTable: "profiles", ascending });
  } else if (sortBy === "date") {
    query = query.order("date", { ascending });
  } else if (sortBy === "checked_in_at") {
    query = query.order("checked_in_at", { ascending });
  } else if (sortBy === "checked_out_at") {
    // nullsFirst false so still-checked-in rows sink to the bottom when
    // ascending — usually what the admin wants.
    query = query.order("checked_out_at", { ascending, nullsFirst: false });
  } else if (sortBy === "status") {
    query = query.order("status", { ascending });
  } else {
    query = query
      .order("date", { ascending: false })
      .order("checked_in_at", { ascending: false });
  }

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
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

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
