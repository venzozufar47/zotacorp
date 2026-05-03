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
  getAttendanceMonthSummary,
  getLiveAttendanceToday,
  type AdminAttendanceSortKey,
} from "@/lib/actions/attendance.actions";
import { AttendanceRecapTable } from "@/components/admin/AttendanceRecapTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { AttendanceTopFilter } from "@/components/admin/AttendanceTopFilter";
import { AttendanceSummaryCards } from "@/components/admin/AttendanceSummaryCards";
import {
  AttendanceViewTabs,
  type AttendanceView,
} from "@/components/admin/AttendanceViewTabs";
import {
  AttendanceMatrixView,
  type MatrixEmployee,
  type MatrixCell,
} from "@/components/admin/AttendanceMatrixView";
import { AttendanceLiveView } from "@/components/admin/AttendanceLiveView";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface SearchParams {
  month?: string;
  year?: string;
  start?: string;
  end?: string;
  userId?: string;
  page?: string;
  sortBy?: string;
  sortDir?: string;
  focus?: string;
  view?: string;
  bu?: string;
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
  if (!user) redirect("/");

  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const params = await searchParams;

  const today = new Date();
  // New filter is monthly. Resolution order:
  //   1. ?month + ?year      → use those (the canonical filter)
  //   2. ?start / ?end       → back-compat for old bookmarks; convert to month
  //   3. neither             → current month
  let month: number;
  let year: number;
  if (params.month && params.year) {
    month = parseInt(params.month, 10);
    year = parseInt(params.year, 10);
  } else if (params.start) {
    const d = new Date(params.start);
    month = d.getMonth() + 1;
    year = d.getFullYear();
  } else {
    month = today.getMonth() + 1;
    year = today.getFullYear();
  }
  const monthAnchor = new Date(year, month - 1, 1);
  const startDate = format(startOfMonth(monthAnchor), "yyyy-MM-dd");
  const endDate = format(endOfMonth(monthAnchor), "yyyy-MM-dd");
  const pageSize = 25;
  const page = parseInt(params.page ?? "1", 10);
  // Validate sort params against the whitelist so a malformed URL doesn't
  // crash the server action.
  const sortBy = SORTABLE_KEYS.includes(params.sortBy as AdminAttendanceSortKey)
    ? (params.sortBy as AdminAttendanceSortKey)
    : undefined;
  const sortDir = params.sortDir === "asc" ? "asc" : "desc";
  const view: AttendanceView =
    params.view === "matrix"
      ? "matrix"
      : params.view === "live"
        ? "live"
        : "recap";
  const selectedBU = params.bu ?? "";

  // Notif bell sends ?focus=<rowId>. Resolve the row's position under
  // the current sort/filter so we can land on the correct page (and the
  // client effect then scrolls + flashes it).
  if (params.focus) {
    const supabase = await createClient();
    const { data: focusRow } = await supabase
      .from("attendance_logs")
      .select("id, user_id, date, checked_in_at")
      .eq("id", params.focus)
      .maybeSingle();
    if (focusRow) {
      // If the row is outside the current filter, snap the filter to its
      // month so it actually appears.
      const fDate = new Date(focusRow.date);
      const fMonth = fDate.getMonth() + 1;
      const fYear = fDate.getFullYear();
      if (fMonth !== month || fYear !== year) {
        const next = new URLSearchParams();
        next.set("month", String(fMonth));
        next.set("year", String(fYear));
        next.set("focus", params.focus);
        if (params.userId) next.set("userId", params.userId);
        redirect(`/admin/attendance?${next.toString()}`);
      }
      // Count rows that come BEFORE the focused row under the current
      // sort (default: date DESC, then checked_in_at DESC). This decides
      // which page to land on.
      let beforeQuery = supabase
        .from("attendance_logs")
        .select("id", { count: "exact", head: true })
        .gte("date", startDate)
        .lte("date", endDate);
      if (params.userId) beforeQuery = beforeQuery.eq("user_id", params.userId);
      // Default sort is date desc → "before" = date strictly newer, or
      // same date with later checked_in_at.
      beforeQuery = beforeQuery.or(
        `date.gt.${focusRow.date},and(date.eq.${focusRow.date},checked_in_at.gt.${focusRow.checked_in_at})`
      );
      const { count: beforeCount } = await beforeQuery;
      const targetPage = Math.floor((beforeCount ?? 0) / 25) + 1;
      if (targetPage !== parseInt(params.page ?? "1", 10)) {
        const next = new URLSearchParams();
        next.set("month", String(month));
        next.set("year", String(year));
        next.set("page", String(targetPage));
        next.set("focus", params.focus);
        if (params.userId) next.set("userId", params.userId);
        redirect(`/admin/attendance?${next.toString()}`);
      }
    }
  }

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

  // Matrix view fetches: scoped to BU + month, only when view === 'matrix'.
  // BU list is needed by the shared top filter on every tab — fetch it
  // unconditionally (one cheap query) so the filter renders on Recap +
  // Live too, not just Matrix.
  let matrixEmployees: MatrixEmployee[] = [];
  let matrixCells: MatrixCell[] = [];
  let businessUnits: string[] = [];
  let allActiveEmps: Array<{
    id: string;
    full_name: string;
    email: string;
    business_unit: string | null;
    avatar_url: string | null;
    avatar_seed: string | null;
    position: string | null;
  }> = [];
  try {
    const supabase = await createClient();
    const { data: empRows } = await supabase
      .from("profiles")
      .select("id, full_name, email, business_unit, avatar_url, avatar_seed, position")
      .eq("is_active", true)
      .order("full_name");
    allActiveEmps = (empRows ?? []) as typeof allActiveEmps;
    businessUnits = Array.from(
      new Set(
        allActiveEmps.map((e) => e.business_unit?.trim()).filter(Boolean) as string[]
      )
    ).sort();
  } catch (err) {
    console.error("[attendance-page] employees fetch error:", err);
  }

  if (view === "matrix") {
    try {
      const supabase = await createClient();
      const filteredEmps = selectedBU
        ? allActiveEmps.filter((e) => (e.business_unit ?? "") === selectedBU)
        : allActiveEmps;
      matrixEmployees = filteredEmps.map((e) => ({
        id: e.id,
        full_name: e.full_name,
        email: e.email,
        avatar_url: e.avatar_url,
        avatar_seed: e.avatar_seed,
        position: (e as { position?: string | null }).position ?? null,
      }));
      const empIds = matrixEmployees.map((e) => e.id);
      if (empIds.length > 0) {
        const { data: cells } = await supabase
          .from("attendance_logs")
          .select(
            "id, user_id, date, status, checked_in_at, checked_out_at, late_minutes, late_proof_url, late_proof_status, late_proof_reason, selfie_path, attendance_locations:matched_location_id(name)"
          )
          .in("user_id", empIds)
          .gte("date", startDate)
          .lte("date", endDate);
        matrixCells = (cells ?? []) as unknown as MatrixCell[];
      }
    } catch (err) {
      console.error("[attendance-page] matrix fetch error:", err);
    }
  }

  return (
    <div className="space-y-5 animate-fade-up overflow-x-hidden">
      <PageHeader
        title="Attendance Recap"
        subtitle={`Overview for all employees — ${format(new Date(startDate), "d MMM")} to ${format(new Date(endDate), "d MMM yyyy")}`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <AttendanceViewTabs current={view} />
        <div className="ml-auto">
          <AttendanceTopFilter
            month={month}
            year={year}
            selectedUserId={params.userId ?? ""}
            selectedBU={selectedBU}
            employees={employees}
            businessUnits={businessUnits}
          />
        </div>
      </div>

      {view === "recap" && (
        <>
          <AttendanceSummaryCardsSection
            startDate={startDate}
            endDate={endDate}
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
        </>
      )}

      {view === "matrix" && (
        <AttendanceMatrixView
          month={month}
          year={year}
          selectedBU={selectedBU}
          employees={matrixEmployees}
          cells={matrixCells}
        />
      )}

      {view === "live" && (
        <AttendanceLiveSection
          userId={params.userId ?? ""}
          businessUnit={selectedBU}
        />
      )}
    </div>
  );
}

async function AttendanceSummaryCardsSection({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const summary = await getAttendanceMonthSummary(startDate, endDate);
  return <AttendanceSummaryCards summary={summary} />;
}

async function AttendanceLiveSection({
  userId,
  businessUnit,
}: {
  userId: string;
  businessUnit: string;
}) {
  const snapshot = await getLiveAttendanceToday();
  // Apply client-of-the-server filter: scope rows to the chosen subject.
  // Doing this here (rather than in the server action) keeps the action
  // generic — same data backs auto-refresh + future variants.
  const filteredRows = snapshot.rows.filter((r) => {
    if (userId && r.userId !== userId) return false;
    return true;
  });
  // Recompute counts on the filtered set so the stat cards stay honest.
  const counts = {
    in: filteredRows.filter((r) => r.status === "in").length,
    late: filteredRows.filter((r) => r.status === "late").length,
    absent: filteredRows.filter((r) => r.status === "absent").length,
    sched: filteredRows.filter((r) => r.status === "sched").length,
    total: filteredRows.length,
  };
  void businessUnit; // BU filtering for Live needs profile.business_unit
  // hydrated into LiveAttendanceRow — deferred; userId filter covers the
  // per-employee case admins typically need.
  return (
    <AttendanceLiveView
      snapshot={{ ...snapshot, rows: filteredRows, counts }}
    />
  );
}
