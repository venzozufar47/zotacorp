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
import {
  isEarlyArrival,
  getEffectiveWorkEnd,
} from "@/lib/utils/attendance-overtime";
import { computeStreak, type StreakLogInput } from "@/lib/utils/streak";
import { renderWaTemplate } from "@/lib/whatsapp/templates";
import { sendWhatsApp } from "@/lib/whatsapp/fonnte";
import { normalizePhone } from "@/lib/whatsapp/normalize-phone";

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

    // Cutoff = work_start_time + grace_period_min + 60s buffer.
    // The 60-second buffer absorbs phone clock drift and network round-trip
    // so an employee who taps "Check In" right at the boundary isn't
    // penalised by a few seconds of processing time.
    const cutoff = new Date(checkinLocal);
    cutoff.setHours(startH, startM + userSettings.grace_period_min, 59, 999);

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

  // Early-arrival flag: only meaningful on fixed schedules. Stamped at
  // check-in so later admin edits to work_start_time don't retroactively
  // reshape OT math for old logs.
  const is_early_arrival =
    !!profile &&
    !profile.is_flexible_schedule &&
    isEarlyArrival(now, profile.work_start_time, timezone);

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
      is_early_arrival,
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

  // Streak ratchet + milestone WA. Runs post-response so Fonnte round-trip
  // never blocks check-in. Guarded against double-firing via
  // `streak_last_milestone` on profiles.
  after(() => updateStreakAfterCheckIn(user.id));

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  return { data };
}

/**
 * Post-check-in streak bookkeeping. Recomputes the current streak from
 * attendance_logs, ratchets `streak_personal_best` when a new high is
 * observed, and fires a single congratulatory WhatsApp the first time a
 * milestone (5/10/20/30/60/100) is crossed. All failures swallowed —
 * this is decoration, never a blocker.
 */
async function updateStreakAfterCheckIn(userId: string): Promise<void> {
  try {
    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "full_name, whatsapp_number, streak_personal_best, streak_last_milestone"
      )
      .eq("id", userId)
      .single();
    if (!profile) return;

    // Last 120 days is more than any milestone window (100) and cheap.
    const { data: logs } = await supabase
      .from("attendance_logs")
      .select("date, status")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(120);

    const snapshot = computeStreak({
      logs: (logs ?? []) as StreakLogInput[],
      storedPersonalBest: profile.streak_personal_best ?? 0,
      storedLastMilestone: profile.streak_last_milestone ?? 0,
    });

    const updates: Partial<{
      streak_personal_best: number;
      streak_last_milestone: number;
    }> = {};
    if (snapshot.personalBest > (profile.streak_personal_best ?? 0)) {
      updates.streak_personal_best = snapshot.personalBest;
    }
    if (snapshot.milestoneHitNow > 0) {
      updates.streak_last_milestone = snapshot.milestoneHitNow;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("profiles").update(updates).eq("id", userId);
    }

    if (snapshot.milestoneHitNow > 0 && profile.whatsapp_number) {
      const phone = normalizePhone(profile.whatsapp_number);
      if (phone) {
        const message = await renderWaTemplate("streak_milestone", {
          name: profile.full_name ?? "teman",
          days: snapshot.milestoneHitNow,
        });
        let status: "sent" | "failed" = "sent";
        let errorMessage: string | null = null;
        try {
          await sendWhatsApp(phone, message);
        } catch (err) {
          status = "failed";
          errorMessage = err instanceof Error ? err.message : String(err);
        }
        // Log ke whatsapp_send_logs supaya muncul di tab admin
        // monitoring. Pakai service-level Supabase client di sini
        // bisa, tapi authenticated client (RLS bypass via service)
        // juga ok karena kita sudah di "use server" + admin gate.
        try {
          await supabase.from("whatsapp_send_logs").insert({
            recipient_profile_id: userId,
            recipient_phone: phone,
            event_type: "streak_milestone",
            message_body: message,
            status,
            error_message: errorMessage,
          });
        } catch (logErr) {
          console.error("[streak] WA log insert failed", logErr);
        }
      }
    }
  } catch (err) {
    console.error("[streak] updateStreakAfterCheckIn failed", err);
  }
}

/**
 * Read-side helper for employee dashboard + /streak detail page.
 * Returns null when the user is unauthenticated.
 */
export async function getMyStreak() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("streak_personal_best, streak_last_milestone")
    .eq("id", user.id)
    .single();

  const { data: logs } = await supabase
    .from("attendance_logs")
    .select("date, status")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(120);

  return computeStreak({
    logs: (logs ?? []) as StreakLogInput[],
    storedPersonalBest: profile?.streak_personal_best ?? 0,
    storedLastMilestone: profile?.streak_last_milestone ?? 0,
  });
}

/**
 * Last N days of on-time/late/absent signal for the employee, newest
 * first. Used by the /streak page's dot grid. Gaps in attendance_logs are
 * returned as `null` (neither on-time nor late — the employee wasn't
 * scheduled, on leave, or it was a weekend).
 */
export async function getMyAttendanceDotGrid(days = 30): Promise<
  Array<{ date: string; status: "on_time" | "late" | "absent" | null }>
> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();

  // Walk N days back from today in the attendance TZ so the grid aligns
  // with how the employee perceives their week.
  const settings = await getCachedAttendanceSettings();
  const tz = settings?.timezone ?? "Asia/Jakarta";
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const start = new Date(`${todayStr}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startStr = start.toISOString().slice(0, 10);

  const { data: logs } = await supabase
    .from("attendance_logs")
    .select("date, status")
    .eq("user_id", user.id)
    .gte("date", startStr)
    .lte("date", todayStr);

  const byDate = new Map<string, "on_time" | "late" | "absent">();
  for (const l of logs ?? []) {
    const s =
      l.status === "on_time"
        ? "on_time"
        : l.status === "late" || l.status === "late_excused"
        ? "late"
        : "absent";
    byDate.set(l.date, s);
  }

  const out: Array<{ date: string; status: "on_time" | "late" | "absent" | null }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(`${todayStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, status: byDate.get(key) ?? null });
  }
  return out;
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
  /**
   * Wajib kalau: (a) employee di luar geofence, ATAU (b) sekarang sudah
   * lewat > 30 menit dari jam kerja selesai. Isi catatan dari karyawan
   * menjelaskan kenapa.
   */
  outsideLocationNote?: string;
  /**
   * Jam checkout sebenarnya (HH:mm) — kalau karyawan baru ingat checkout
   * hari itu. Kalau diberikan, `checked_out_at` disimpan di tanggal yang
   * sama dengan check-in + jam ini (TZ-aware). Harus > jam check-in dan
   * <= jam sekarang, kalau tidak server reject.
   */
  overrideCheckoutTime?: string;
}

/**
 * Jeda toleransi (menit) antara jam kerja selesai dan "sekarang"
 * sebelum kita menganggap checkout sudah cukup telat untuk meminta
 * konfirmasi. Di bawah threshold ini, asumsi default = baru selesai.
 */
const LATE_CHECKOUT_CONFIRM_THRESHOLD_MIN = 30;

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

  const checkoutLat = payload?.latitude ?? null;
  const checkoutLng = payload?.longitude ?? null;
  const note = payload?.outsideLocationNote?.trim() || null;
  const overrideTime = payload?.overrideCheckoutTime?.trim() || null;

  // Geofence soft-check tetap dilakukan, tapi kita treat sebagai
  // "perlu konfirmasi" — bukan hard-fail. Kombinasi outside-location
  // ATAU keterlambatan > 30 menit sama-sama trigger dialog konfirmasi
  // di client yang menawarkan dua opsi: pakai jam sekarang atau input
  // jam lebih awal.
  const decision = await evaluateCheckOut(user.id, checkoutLat, checkoutLng, note);
  const outsideLocation = decision.requiresNote === true;

  // Profile + settings dulu — dipakai baik untuk tahu jam kerja
  // (threshold 30-menit) maupun untuk overtime calc di bawah.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, is_flexible_schedule, work_start_time, work_end_time")
    .eq("id", user.id)
    .single();
  const settings = await getCachedAttendanceSettings();
  const timezone = settings?.timezone ?? "Asia/Jakarta";

  const now = new Date();

  // Threshold keterlambatan: karyawan flexible tidak punya jam akhir
  // tetap → skip threshold check. Untuk jadwal tetap, kita hitung
  // effectiveEnd dan compare ke `now`. Kalau > 30 menit, butuh
  // konfirmasi juga (supaya karyawan yang baru ingat pulang tapi
  // sebenarnya pulang jam 18 bisa koreksi).
  let exceededLateThreshold = false;
  let effectiveEndDate: Date | null = null;
  if (!profile?.is_flexible_schedule) {
    try {
      effectiveEndDate = getEffectiveWorkEnd(
        new Date(existing.checked_in_at),
        profile?.work_start_time ?? "09:00",
        profile?.work_end_time ?? "18:00",
        timezone,
        false
      );
      if (effectiveEndDate) {
        const nowLocal = new Date(
          now.toLocaleString("en-US", { timeZone: timezone })
        );
        const diffMin =
          (nowLocal.getTime() - effectiveEndDate.getTime()) / 60_000;
        exceededLateThreshold = diffMin > LATE_CHECKOUT_CONFIRM_THRESHOLD_MIN;
      }
    } catch {
      // Ignore — treat sebagai tidak melewati threshold
    }
  }

  const needsConfirmation = outsideLocation || exceededLateThreshold;

  // Kalau butuh konfirmasi tapi client belum kirim note / override,
  // return signal supaya client buka dialog. Note wajib di semua
  // skenario confirmation; override opsional.
  if (needsConfirmation && !note && !overrideTime) {
    const toHHMM = (d: Date) =>
      `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const nowLocal = new Date(
      now.toLocaleString("en-US", { timeZone: timezone })
    );
    const checkinLocal = new Date(
      new Date(existing.checked_in_at).toLocaleString("en-US", {
        timeZone: timezone,
      })
    );
    return {
      requiresConfirmation: true as const,
      // Legacy flag dipertahankan untuk fallback client yang belum
      // update — tetap dipaksa isi note di dialog baru.
      requiresNote: true,
      reasonCode: outsideLocation ? "outside_location" : "late_over_threshold",
      currentTime: toHHMM(nowLocal),
      workEndTime:
        effectiveEndDate != null ? toHHMM(effectiveEndDate) : null,
      checkinTime: toHHMM(checkinLocal),
    };
  }

  // Sampai titik ini: user sudah kasih note (atau posisi dalam radius
  // + tidak telat). Kalau note kosong saat outside/late masih butuh
  // reject eksplisit.
  if (needsConfirmation && !note) {
    return {
      error: "Catatan wajib diisi saat checkout di luar lokasi atau lewat 30 menit.",
      requiresConfirmation: true as const,
      requiresNote: true,
    };
  }
  // decision.error muncul kalau evaluateCheckOut menolak karena reason
  // lain selain "butuh catatan" (shouldn't happen in current flow),
  // tetap propagate.
  if (!decision.ok && !needsConfirmation) {
    return {
      error: decision.error ?? "Check out ditolak.",
      requiresNote: decision.requiresNote,
    };
  }

  const isOvertime = payload?.isOvertime ?? false;
  const overtimeReason = payload?.overtimeReason ?? "";

  // Compute jam checkout final (TZ-aware). Kalau override diberikan,
  // pakai tanggal dari check-in + jam dari override. Kalau tidak,
  // pakai `now`. Override-path validasi strict: > checkin dan <= now.
  let checkoutInstant = now;
  if (overrideTime) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(overrideTime);
    if (!m) {
      return { error: "Format jam checkout tidak valid (HH:mm)." };
    }
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return { error: "Jam checkout tidak valid." };
    }
    const checkinDate = new Date(existing.checked_in_at);
    const dateInTz = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(checkinDate);
    const assumedUtc = new Date(`${dateInTz}T${overrideTime}:00Z`);
    const utcWall = new Date(assumedUtc.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzWall = new Date(assumedUtc.toLocaleString("en-US", { timeZone: timezone }));
    const offsetMs = tzWall.getTime() - utcWall.getTime();
    checkoutInstant = new Date(assumedUtc.getTime() - offsetMs);
    if (checkoutInstant.getTime() <= checkinDate.getTime()) {
      return {
        error: "Jam checkout harus SETELAH jam check-in.",
      };
    }
    if (checkoutInstant.getTime() > now.getTime()) {
      return {
        error: "Jam checkout tidak boleh lebih dari jam sekarang.",
      };
    }
  }

  let overtimeMinutes = 0;

  if (isOvertime && !profile?.is_flexible_schedule) {
    try {
      const checkoutLocal = new Date(
        checkoutInstant.toLocaleString("en-US", { timeZone: timezone })
      );
      // Effective end = work_end_time for normal arrivals, or
      // check_in_at + standard duration for early arrivals. A single
      // code path that subsumes both cases.
      const effectiveEnd =
        effectiveEndDate ??
        getEffectiveWorkEnd(
          new Date(existing.checked_in_at),
          profile?.work_start_time ?? "09:00",
          profile?.work_end_time ?? "18:00",
          timezone,
          false
        );

      if (effectiveEnd && checkoutLocal > effectiveEnd) {
        overtimeMinutes = Math.ceil(
          (checkoutLocal.getTime() - effectiveEnd.getTime()) / 60_000
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
      checked_out_at: checkoutInstant.toISOString(),
      checkout_latitude: checkoutLat,
      checkout_longitude: checkoutLng,
      // Note disimpan juga ke `late_checkout_reason` supaya panel admin
      // yang baca field itu tetap dapat konteks — legacy `checkout_outside_note`
      // disimpan bersamaan buat audit GPS.
      checkout_outside_note: note,
      late_checkout_reason: note,
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
// Admin override — overwrite attendance_logs row. Admin boleh koreksi jam
// check-in/check-out, status, late_minutes, overtime, dan catatan-catatan
// setelah karyawan submit (mis. karyawan salah record, lupa checkout
// dan baru ingat setelah sehari, dll). Dibatasi admin-only via RLS +
// guard di sini.
// ---------------------------------------------------------------------------

interface AdminUpdateAttendancePayload {
  attendanceLogId: string;
  /** HH:mm di timezone admin. Null/undefined = tidak diubah. */
  checkInTime?: string | null;
  /** HH:mm di timezone admin. Null = unset (jadi belum checkout). */
  checkOutTime?: string | null;
  status?: "on_time" | "late" | "late_excused" | "flexible" | null;
  lateMinutes?: number | null;
  isOvertime?: boolean | null;
  overtimeMinutes?: number | null;
  overtimeStatus?: "approved" | "pending" | "rejected" | null;
  lateCheckoutReason?: string | null;
  lateProofAdminNote?: string | null;
}

export async function adminUpdateAttendanceLog(
  payload: AdminUpdateAttendancePayload
) {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  const role = await getCurrentRole();
  if (role !== "admin") return { error: "Forbidden" };

  const supabase = await createClient();
  const { data: log } = await supabase
    .from("attendance_logs")
    .select("id, user_id, date, checked_in_at")
    .eq("id", payload.attendanceLogId)
    .single();
  if (!log) return { error: "Attendance record not found." };

  const settings = await getCachedAttendanceSettings();
  const timezone = settings?.timezone ?? "Asia/Jakarta";

  /**
   * Konversi `YYYY-MM-DD` + `HH:mm` di target timezone → UTC ISO
   * string. Reuse trick yang sama dengan `lateCheckout`: parse as UTC
   * lalu koreksi offset TZ.
   */
  function hhmmToUtc(dateIso: string, hhmm: string): string | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    const assumedUtc = new Date(`${dateIso}T${hhmm.padStart(5, "0")}:00Z`);
    const utcWall = new Date(assumedUtc.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzWall = new Date(assumedUtc.toLocaleString("en-US", { timeZone: timezone }));
    const offsetMs = tzWall.getTime() - utcWall.getTime();
    return new Date(assumedUtc.getTime() - offsetMs).toISOString();
  }

  // Build patch object — hanya sertakan field yang diubah.
  const patch: Record<string, unknown> = {};

  if (payload.checkInTime !== undefined && payload.checkInTime !== null) {
    const iso = hhmmToUtc(log.date, payload.checkInTime);
    if (!iso) return { error: "Format jam check-in tidak valid (HH:mm)." };
    patch.checked_in_at = iso;
  }

  if (payload.checkOutTime !== undefined) {
    if (payload.checkOutTime === null || payload.checkOutTime === "") {
      patch.checked_out_at = null;
    } else {
      const iso = hhmmToUtc(log.date, payload.checkOutTime);
      if (!iso) return { error: "Format jam check-out tidak valid (HH:mm)." };
      patch.checked_out_at = iso;
    }
  }

  if (patch.checked_in_at && patch.checked_out_at) {
    if (new Date(patch.checked_in_at as string).getTime() >=
        new Date(patch.checked_out_at as string).getTime()) {
      return { error: "Jam checkout harus SETELAH jam check-in." };
    }
  } else if (patch.checked_in_at && log) {
    // Kalau hanya check-in yang diubah, validasi tetap konsisten
    // dengan checkout existing (kalau ada).
    const existingCheckout = (
      await supabase
        .from("attendance_logs")
        .select("checked_out_at")
        .eq("id", payload.attendanceLogId)
        .single()
    ).data?.checked_out_at;
    if (
      existingCheckout &&
      new Date(patch.checked_in_at as string).getTime() >=
        new Date(existingCheckout as string).getTime()
    ) {
      return { error: "Jam check-in harus SEBELUM jam checkout existing." };
    }
  }

  if (payload.status !== undefined && payload.status !== null) patch.status = payload.status;
  if (payload.lateMinutes !== undefined && payload.lateMinutes !== null) {
    if (!Number.isFinite(payload.lateMinutes) || payload.lateMinutes < 0) {
      return { error: "late_minutes tidak valid." };
    }
    patch.late_minutes = Math.round(payload.lateMinutes);
  }
  if (payload.isOvertime !== undefined && payload.isOvertime !== null) {
    patch.is_overtime = payload.isOvertime;
  }
  if (payload.overtimeMinutes !== undefined && payload.overtimeMinutes !== null) {
    if (!Number.isFinite(payload.overtimeMinutes) || payload.overtimeMinutes < 0) {
      return { error: "overtime_minutes tidak valid." };
    }
    patch.overtime_minutes = Math.round(payload.overtimeMinutes);
  }
  if (payload.overtimeStatus !== undefined) patch.overtime_status = payload.overtimeStatus;
  if (payload.lateCheckoutReason !== undefined) {
    patch.late_checkout_reason = payload.lateCheckoutReason?.trim() || null;
  }
  if (payload.lateProofAdminNote !== undefined) {
    patch.late_proof_admin_note = payload.lateProofAdminNote?.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return { error: "Tidak ada perubahan." };
  }

  patch.updated_at = new Date().toISOString();

  // Cast ke `any` karena Supabase typegen strict kolom-demi-kolom;
  // kita sudah validasi masing-masing key di atas, jadi aman.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from("attendance_logs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq("id", payload.attendanceLogId);
  if (error) return { error: error.message };

  revalidatePath("/admin/attendance");
  return { ok: true as const };
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
    .select("is_flexible_schedule, work_start_time, work_end_time")
    .eq("id", user.id)
    .single();

  let overtimeMinutes = 0;

  if (isOvertime && !profile?.is_flexible_schedule) {
    // Use the same shared helper as `checkOut` so retroactive checkouts
    // honour early-arrival overtime too. We need a TZ-aware checkout
    // moment to compare against `effectiveEnd`; `checkoutDate` above is
    // already a UTC instant from the user's HH:mm in the target TZ, so
    // shift the same way the helper expects.
    const settings = await getCachedAttendanceSettings();
    const tz = settings?.timezone ?? "Asia/Jakarta";
    const checkoutLocal = new Date(
      checkoutDate.toLocaleString("en-US", { timeZone: tz })
    );
    const effectiveEnd = getEffectiveWorkEnd(
      checkinDate,
      profile?.work_start_time ?? "09:00",
      profile?.work_end_time ?? "18:00",
      tz,
      false
    );

    if (effectiveEnd && checkoutLocal > effectiveEnd) {
      overtimeMinutes = Math.min(
        Math.ceil((checkoutLocal.getTime() - effectiveEnd.getTime()) / 60_000),
        480
      );
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
      profiles!inner(full_name, email, avatar_url, avatar_seed, position),
      attendance_locations:matched_location_id(name)
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

// ─────────────────────────────────────────────────────────────────────
// Admin attendance Hi-Fi additions: Recap summary + Live timeline
// ─────────────────────────────────────────────────────────────────────

export interface AttendanceMonthSummary {
  loggedHours: number;
  onTimeRate: number; // 0..1
  totalLogs: number;
  lateCount: number;
  /** Late incidents whose `late_proof_status` was approved by an admin. */
  approvedLateCount: number;
}

/**
 * Aggregate stats shown above the Recap table. Single SELECT — fast
 * even for full month × 20+ employees.
 */
export async function getAttendanceMonthSummary(
  startDate: string,
  endDate: string
): Promise<AttendanceMonthSummary> {
  const role = await getCurrentRole();
  const empty: AttendanceMonthSummary = {
    loggedHours: 0,
    onTimeRate: 0,
    totalLogs: 0,
    lateCount: 0,
    approvedLateCount: 0,
  };
  if (role !== "admin") return empty;

  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance_logs")
    .select("status, checked_in_at, checked_out_at, late_proof_status")
    .gte("date", startDate)
    .lte("date", endDate);

  const logs = data ?? [];
  let loggedMs = 0;
  let onTime = 0;
  let late = 0;
  let approvedLate = 0;
  for (const l of logs) {
    if (l.checked_out_at) {
      loggedMs +=
        new Date(l.checked_out_at).getTime() -
        new Date(l.checked_in_at).getTime();
    }
    if (l.status === "on_time" || l.status === "flexible") onTime++;
    else if (l.status === "late") {
      late++;
      if (l.late_proof_status === "approved") approvedLate++;
    }
  }
  return {
    loggedHours: Math.round(loggedMs / 3_600_000),
    onTimeRate: logs.length === 0 ? 0 : onTime / logs.length,
    totalLogs: logs.length,
    lateCount: late,
    approvedLateCount: approvedLate,
  };
}

export interface LiveAttendanceRow {
  userId: string;
  fullName: string;
  position: string | null;
  locationName: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
  status: "in" | "late" | "done" | "absent" | "sched" | "off";
  checkedInAt: string | null;
  checkedOutAt: string | null;
  /** Hour float, e.g. 9.0 = 09:00, 8.5 = 08:30. Null when employee has
   *  no scheduled start (flexible schedule). */
  scheduledStart: number | null;
}

export interface LiveAttendanceSnapshot {
  rows: LiveAttendanceRow[];
  nowIso: string;
  todayIso: string;
  counts: {
    in: number;
    late: number;
    absent: number;
    sched: number;
    total: number;
  };
}

/** Convert "HH:MM:SS" → hour float. Returns null on bad input. */
function parseHourFloat(t: string | null | undefined): number | null {
  if (!t) return null;
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? "0");
  if (!Number.isFinite(h)) return null;
  return h + m / 60;
}

/**
 * Live attendance snapshot for today — drives the Gantt-style timeline
 * on the Live tab. One query for active employees + one for today's
 * logs; status derived in-memory.
 */
export async function getLiveAttendanceToday(): Promise<LiveAttendanceSnapshot> {
  const role = await getCurrentRole();
  const settings = await getCachedAttendanceSettings();
  const tz = settings?.timezone ?? "Asia/Jakarta";
  const now = new Date();
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const empty: LiveAttendanceSnapshot = {
    rows: [],
    nowIso: now.toISOString(),
    todayIso,
    counts: { in: 0, late: 0, absent: 0, sched: 0, total: 0 },
  };
  if (role !== "admin") return empty;

  const supabase = await createClient();
  const [empRes, logsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, avatar_url, avatar_seed, position, work_start_time, is_flexible_schedule, is_active, payslip_excluded"
      )
      .eq("is_active", true)
      .eq("payslip_excluded", false)
      .order("full_name"),
    supabase
      .from("attendance_logs")
      .select(
        "user_id, status, checked_in_at, checked_out_at, attendance_locations:matched_location_id(name)"
      )
      .eq("date", todayIso),
  ]);

  const employees = empRes.data ?? [];
  const logs = (logsRes.data ?? []) as Array<{
    user_id: string;
    status: string;
    checked_in_at: string;
    checked_out_at: string | null;
    attendance_locations: { name: string } | null;
  }>;
  const logByUser = new Map<string, (typeof logs)[number]>();
  for (const l of logs) logByUser.set(l.user_id, l);

  // Local hour float in org tz — for deciding "late" vs "scheduled"
  const nowHourLocal = (() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h + m / 60;
  })();

  const rows: LiveAttendanceRow[] = employees.map((e) => {
    const log = logByUser.get(e.id);
    const scheduledStart = e.is_flexible_schedule
      ? null
      : parseHourFloat(e.work_start_time);
    let status: LiveAttendanceRow["status"];
    if (log) {
      if (log.checked_out_at) status = "done";
      else if (log.status === "late") status = "late";
      else status = "in";
    } else if (scheduledStart != null) {
      status = nowHourLocal >= scheduledStart ? "absent" : "sched";
    } else {
      // Flexible schedule employee with no log yet — treat as scheduled
      // until they check in (avoids over-flagging absent).
      status = "sched";
    }
    return {
      userId: e.id,
      fullName: e.full_name,
      position: e.position || null,
      locationName: log?.attendance_locations?.name ?? null,
      avatarUrl: e.avatar_url,
      avatarSeed: e.avatar_seed,
      status,
      checkedInAt: log?.checked_in_at ?? null,
      checkedOutAt: log?.checked_out_at ?? null,
      scheduledStart,
    };
  });

  // Sort: in/late first, then sched, then done, then absent, then off.
  // Within each bucket: by scheduled start asc, then name.
  const ORDER: Record<LiveAttendanceRow["status"], number> = {
    in: 0,
    late: 1,
    sched: 2,
    done: 3,
    absent: 4,
    off: 5,
  };
  rows.sort((a, b) => {
    if (a.status !== b.status) return ORDER[a.status] - ORDER[b.status];
    const sa = a.scheduledStart ?? 99;
    const sb = b.scheduledStart ?? 99;
    if (sa !== sb) return sa - sb;
    return a.fullName.localeCompare(b.fullName);
  });

  const counts = {
    in: rows.filter((r) => r.status === "in").length,
    late: rows.filter((r) => r.status === "late").length,
    absent: rows.filter((r) => r.status === "absent").length,
    sched: rows.filter((r) => r.status === "sched").length,
    total: rows.length,
  };

  return { rows, nowIso: now.toISOString(), todayIso, counts };
}
