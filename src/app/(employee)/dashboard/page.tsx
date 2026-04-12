export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getCurrentProfile,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import { getTodayAttendance } from "@/lib/actions/attendance.actions";
import { CheckInButton } from "@/components/attendance/CheckInButton";
import { AttendanceStatusCard } from "@/components/attendance/AttendanceStatusCard";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, todayLog, settings] = await Promise.all([
    getCurrentProfile(),
    getTodayAttendance(),
    getCachedAttendanceSettings(),
  ]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const today = format(new Date(), "EEEE, d MMMM");

  // Fetch admin rejection note for today's log if applicable
  let overtimeAdminNote: string | null = null;
  if (todayLog?.id) {
    const supabase = await createClient();
    const { data: otReq } = await supabase
      .from("overtime_requests")
      .select("admin_note")
      .eq("attendance_log_id", todayLog.id)
      .single();
    overtimeAdminNote = otReq?.admin_note ?? null;
  }

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
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Attendance
          </p>

          <AttendanceStatusCard
            log={todayLog}
            timezone={settings?.timezone}
            overtimeAdminNote={overtimeAdminNote}
          />
          <CheckInButton
            todayLog={todayLog}
            settings={settings}
            isFlexible={profile?.is_flexible_schedule ?? false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
