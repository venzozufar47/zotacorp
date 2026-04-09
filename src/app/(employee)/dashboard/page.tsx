export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTodayAttendance } from "@/lib/actions/attendance.actions";
import { CheckInButton } from "@/components/attendance/CheckInButton";
import { AttendanceStatusCard } from "@/components/attendance/AttendanceStatusCard";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const [profileResult, todayLog] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).single(),
    getTodayAttendance(),
  ]);

  const profile = profileResult.data;
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const today = format(new Date(), "EEEE, d MMMM");

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">
          Hey, {firstName} 👋
        </h2>
        <p className="text-muted-foreground text-sm mt-0.5">{today}</p>
      </div>

      <Card className="border-0 shadow-sm animate-fade-up animate-fade-up-delay-1">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Attendance
            </p>
            {profile && (
              <span className="text-xs text-muted-foreground">
                {profile.department} · {profile.position}
              </span>
            )}
          </div>

          <AttendanceStatusCard log={todayLog} />
          <CheckInButton todayLog={todayLog} />
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm animate-fade-up animate-fade-up-delay-2">
        <CardContent className="p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Quick info
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#f5f5f7] rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Department</p>
              <p className="font-semibold text-sm mt-0.5">{profile?.department ?? "—"}</p>
            </div>
            <div className="bg-[#f5f5f7] rounded-xl p-3">
              <p className="text-xs text-muted-foreground">Position</p>
              <p className="font-semibold text-sm mt-0.5">{profile?.position ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
