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

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = await getCurrentRole();
  if (role === "admin") redirect("/admin/attendance");

  const [logs, settings] = await Promise.all([
    getMyAttendanceLogs(30),
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

      <AttendanceHistoryTable logs={logsWithOt} timezone={settings?.timezone} />
    </div>
  );
}
