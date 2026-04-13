export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getCurrentRole,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import { getAllAttendanceLogs, getAllEmployees } from "@/lib/actions/attendance.actions";
import { AttendanceRecapTable } from "@/components/admin/AttendanceRecapTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { AttendanceFilters } from "@/components/admin/AttendanceFilters";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface SearchParams {
  start?: string;
  end?: string;
  userId?: string;
  page?: string;
}

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const params = await searchParams;

  const today = new Date();
  const startDate = params.start ?? format(startOfMonth(today), "yyyy-MM-dd");
  const endDate = params.end ?? format(endOfMonth(today), "yyyy-MM-dd");
  const page = parseInt(params.page ?? "1", 10);
  const pageSize = 25;

  const [logsResult, employees, settings] = await Promise.all([
    getAllAttendanceLogs({
      startDate,
      endDate,
      userId: params.userId,
      page,
      pageSize,
    }).catch(() => ({ data: [] as Awaited<ReturnType<typeof getAllAttendanceLogs>>["data"], count: 0 })),
    getAllEmployees(),
    getCachedAttendanceSettings(),
  ]);

  const { data, count } = logsResult;

  // Fetch overtime requests for the displayed attendance logs
  const logIds = data.map((d: { id: string }) => d.id);
  let overtimeMap: Record<string, { id: string; reason: string; status: string; admin_note: string | null }> = {};

  if (logIds.length > 0) {
    const supabase = await createClient();
    const { data: otRequests } = await supabase
      .from("overtime_requests")
      .select("id, attendance_log_id, reason, status, admin_note")
      .in("attendance_log_id", logIds);

    if (otRequests) {
      for (const ot of otRequests) {
        overtimeMap[ot.attendance_log_id] = {
          id: ot.id,
          reason: ot.reason,
          status: ot.status,
          admin_note: ot.admin_note,
        };
      }
    }
  }

  // Merge overtime requests into attendance rows
  const rowsWithOt = data.map((row: Record<string, unknown>) => ({
    ...row,
    overtime_requests: overtimeMap[(row as { id: string }).id]
      ? [overtimeMap[(row as { id: string }).id]]
      : [],
  }));

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Attendance Recap"
        subtitle={`Overview for all employees — ${format(new Date(startDate), "d MMM")} to ${format(new Date(endDate), "d MMM yyyy")}`}
      />

      <AttendanceFilters
        startDate={startDate}
        endDate={endDate}
        selectedUserId={params.userId ?? ""}
        employees={employees}
      />

      <AttendanceRecapTable
        rows={rowsWithOt as Parameters<typeof AttendanceRecapTable>[0]["rows"]}
        count={count}
        page={page}
        pageSize={pageSize}
        timezone={settings?.timezone}
      />
    </div>
  );
}
