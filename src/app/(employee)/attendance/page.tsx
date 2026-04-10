export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getMyAttendanceLogs,
  getMyAttendanceSummary,
} from "@/lib/actions/attendance.actions";
import { getAttendanceSettings } from "@/lib/actions/settings.actions";
import { AttendanceHistoryTable } from "@/components/attendance/AttendanceHistoryTable";
import { AttendanceSummaryCard } from "@/components/attendance/AttendanceSummaryCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { format } from "date-fns";

export default async function AttendancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthLabel = format(now, "MMMM yyyy");

  const [logs, summary, settings] = await Promise.all([
    getMyAttendanceLogs(30),
    getMyAttendanceSummary(month, year),
    getAttendanceSettings(),
  ]);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="My Attendance"
        subtitle="Your check-in history and monthly summary"
      />

      {summary && (
        <AttendanceSummaryCard summary={summary} monthLabel={monthLabel} />
      )}

      <AttendanceHistoryTable logs={logs} timezone={settings?.timezone} />
    </div>
  );
}
