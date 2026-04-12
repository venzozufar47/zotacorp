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
  getMyAttendanceSummary,
} from "@/lib/actions/attendance.actions";
import { AttendanceHistoryTable } from "@/components/attendance/AttendanceHistoryTable";
import { AttendanceSummaryCard } from "@/components/attendance/AttendanceSummaryCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { format } from "date-fns";

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = await getCurrentRole();
  if (role === "admin") redirect("/admin/attendance");

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthLabel = format(now, "MMMM yyyy");

  const [logs, summary, settings] = await Promise.all([
    getMyAttendanceLogs(30),
    getMyAttendanceSummary(month, year),
    getCachedAttendanceSettings(),
  ]);

  // Fetch overtime requests for the employee's logs to show admin rejection reasons
  const logIds = logs.map((l) => l.id);
  let overtimeMap: Record<string, { admin_note: string | null; reason: string }> = {};

  if (logIds.length > 0) {
    const supabase = await createClient();
    const { data: otRequests } = await supabase
      .from("overtime_requests")
      .select("attendance_log_id, reason, admin_note")
      .in("attendance_log_id", logIds);

    if (otRequests) {
      for (const ot of otRequests) {
        overtimeMap[ot.attendance_log_id] = {
          admin_note: ot.admin_note,
          reason: ot.reason,
        };
      }
    }
  }

  // Attach overtime request data to logs
  const logsWithOt = logs.map((log) => ({
    ...log,
    overtime_admin_note: overtimeMap[log.id]?.admin_note ?? null,
  }));

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="My Attendance"
        subtitle="Your check-in history and monthly summary"
      />

      {summary && (
        <AttendanceSummaryCard summary={summary} monthLabel={monthLabel} />
      )}

      <AttendanceHistoryTable logs={logsWithOt} timezone={settings?.timezone} />
    </div>
  );
}
