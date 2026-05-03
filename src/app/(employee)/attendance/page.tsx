export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getCurrentRole,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import {
  getMyAttendanceLogs,
} from "@/lib/actions/attendance.actions";
import { AttendanceHistoryTable } from "@/components/attendance/AttendanceHistoryTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { getDictionary } from "@/lib/i18n/server";

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const role = await getCurrentRole();
  if (role === "admin") redirect("/admin/attendance");

  const supabase = await createClient();
  /**
   * Batch ALL queries this page needs — logs + settings + profile +
   * overtime requests — into a single Promise.all. The overtime query
   * is scoped by `user_id` rather than an explicit `log_id in (…)` list
   * so it can run in parallel with the logs fetch. We then join them
   * in-memory below.
   */
  const [logs, settings, profileRes, overtimeRes, dict] = await Promise.all([
    getMyAttendanceLogs(30),
    getCachedAttendanceSettings(),
    supabase
      .from("profiles")
      .select("work_end_time, is_flexible_schedule")
      .eq("id", user.id)
      .single(),
    supabase
      .from("overtime_requests")
      .select("attendance_log_id, reason, admin_note")
      .eq("user_id", user.id),
    getDictionary(),
  ]);
  const profile = profileRes.data;
  const { t } = dict;

  const overtimeMap: Record<string, { admin_note: string | null; reason: string }> = {};
  for (const ot of overtimeRes.data ?? []) {
    overtimeMap[ot.attendance_log_id] = {
      admin_note: ot.admin_note,
      reason: ot.reason,
    };
  }

  // Pull all extra-work entries for this user across the displayed log
  // dates so we can render them inside the Notes cell. Grouped by date.
  const extraWorkByDate: Record<string, { kind: string }[]> = {};
  if (logs.length > 0) {
    const dates = Array.from(new Set(logs.map((l) => l.date)));
    const { data: extra } = await supabase
      .from("extra_work_logs")
      .select("date, kind")
      .eq("user_id", user.id)
      .in("date", dates);
    for (const e of extra ?? []) {
      (extraWorkByDate[e.date] ??= []).push({ kind: e.kind });
    }
  }

  // Attach overtime + extra-work data to logs
  const logsWithOt = logs.map((log) => ({
    ...log,
    overtime_admin_note: overtimeMap[log.id]?.admin_note ?? null,
    extra_work: extraWorkByDate[log.date] ?? [],
  }));

  return (
    <div className="space-y-5 animate-fade-up overflow-x-hidden">
      <PageHeader
        title={t.attendancePage.title}
        subtitle={t.attendancePage.subtitle}
      />

      <AttendanceHistoryTable
        logs={logsWithOt}
        timezone={settings?.timezone}
        workEndTime={profile?.work_end_time}
        isFlexibleSchedule={profile?.is_flexible_schedule}
      />
    </div>
  );
}
