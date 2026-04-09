import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyAttendanceLogs } from "@/lib/actions/attendance.actions";
import { AttendanceHistoryTable } from "@/components/attendance/AttendanceHistoryTable";
import { PageHeader } from "@/components/shared/PageHeader";

export default async function AttendancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const logs = await getMyAttendanceLogs(30);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="My Attendance"
        subtitle="Your last 30 days of check-in history"
      />
      <AttendanceHistoryTable logs={logs} />
    </div>
  );
}
