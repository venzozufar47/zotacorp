import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllAttendanceLogs } from "@/lib/actions/attendance.actions";
import { AttendanceRecapTable } from "@/components/admin/AttendanceRecapTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { AttendanceFilters } from "@/components/admin/AttendanceFilters";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface SearchParams {
  start?: string;
  end?: string;
  department?: string;
  search?: string;
  page?: string;
}

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Verify admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/dashboard");

  const params = await searchParams;

  const today = new Date();
  const startDate = params.start ?? format(startOfMonth(today), "yyyy-MM-dd");
  const endDate = params.end ?? format(endOfMonth(today), "yyyy-MM-dd");
  const page = parseInt(params.page ?? "1", 10);
  const pageSize = 25;

  const { data, count } = await getAllAttendanceLogs({
    startDate,
    endDate,
    department: params.department,
    search: params.search,
    page,
    pageSize,
  });

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Attendance Recap"
        subtitle={`Overview for all employees — ${format(new Date(startDate), "d MMM")} to ${format(new Date(endDate), "d MMM yyyy")}`}
      />

      <AttendanceFilters
        startDate={startDate}
        endDate={endDate}
        department={params.department ?? ""}
        search={params.search ?? ""}
      />

      <AttendanceRecapTable
        rows={data as Parameters<typeof AttendanceRecapTable>[0]["rows"]}
        count={count}
        page={page}
        pageSize={pageSize}
      />
    </div>
  );
}
