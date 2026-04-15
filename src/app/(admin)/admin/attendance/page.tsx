export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getCurrentRole,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import {
  getAllAttendanceLogs,
  getAllEmployees,
  type AdminAttendanceSortKey,
} from "@/lib/actions/attendance.actions";
import { AttendanceRecapTable } from "@/components/admin/AttendanceRecapTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { AttendanceFilters } from "@/components/admin/AttendanceFilters";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface SearchParams {
  start?: string;
  end?: string;
  userId?: string;
  page?: string;
  sortBy?: string;
  sortDir?: string;
}

const SORTABLE_KEYS: AdminAttendanceSortKey[] = [
  "date",
  "checked_in_at",
  "checked_out_at",
  "status",
  "employee",
];

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
  // Validate sort params against the whitelist so a malformed URL doesn't
  // crash the server action.
  const sortBy = SORTABLE_KEYS.includes(params.sortBy as AdminAttendanceSortKey)
    ? (params.sortBy as AdminAttendanceSortKey)
    : undefined;
  const sortDir = params.sortDir === "asc" ? "asc" : "desc";

  let rowsWithOt: Parameters<typeof AttendanceRecapTable>[0]["rows"] = [];
  let count = 0;
  let employees: Awaited<ReturnType<typeof getAllEmployees>> = [];
  let settings: Awaited<ReturnType<typeof getCachedAttendanceSettings>> = null;

  try {
    const [logsResult, emps, s] = await Promise.all([
      getAllAttendanceLogs({
        startDate,
        endDate,
        userId: params.userId,
        page,
        pageSize,
        sortBy,
        sortDir,
      }),
      getAllEmployees(),
      getCachedAttendanceSettings(),
    ]);

    employees = emps;
    settings = s;
    const { data } = logsResult;
    count = logsResult.count;

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

    // Pull extra-work entries for the same date range × visible employees
    // and group by `${user_id}|${date}` so each attendance row can pluck
    // its matching set in O(1) below.
    const extraWorkByKey: Record<string, { kind: string }[]> = {};
    if (data.length > 0) {
      const userIds = Array.from(new Set(data.map((d: Record<string, unknown>) => d.user_id as string)));
      const dates = Array.from(new Set(data.map((d: Record<string, unknown>) => d.date as string)));
      const supabase = await createClient();
      const { data: extra } = await supabase
        .from("extra_work_logs")
        .select("user_id, date, kind")
        .in("user_id", userIds)
        .in("date", dates);
      for (const e of extra ?? []) {
        const key = `${e.user_id}|${e.date}`;
        (extraWorkByKey[key] ??= []).push({ kind: e.kind });
      }
    }

    // Merge overtime requests + extra-work entries into attendance rows
    rowsWithOt = data.map((row: Record<string, unknown>) => ({
      ...row,
      overtime_requests: overtimeMap[(row as { id: string }).id]
        ? [overtimeMap[(row as { id: string }).id]]
        : [],
      extra_work:
        extraWorkByKey[`${row.user_id as string}|${row.date as string}`] ?? [],
    })) as typeof rowsWithOt;
  } catch (err) {
    console.error("[attendance-page] data fetch error:", err);
    // If anything fails, render with empty data — the table shows "No records found"
    employees = await getAllEmployees().catch(() => []);
  }

  return (
    <div className="space-y-5 animate-fade-up overflow-x-hidden">
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
        sortBy={sortBy ?? null}
        sortDir={sortDir}
      />
    </div>
  );
}
