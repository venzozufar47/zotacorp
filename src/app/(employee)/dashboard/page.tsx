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
import { ProfileCompletionCard } from "@/components/profile/ProfileCompletionCard";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { getDictionary } from "@/lib/i18n/server";

const PROFILE_SECTIONS: { title: string; keys: string[] }[] = [
  {
    title: "Personal Information",
    keys: ["full_name", "gender", "date_of_birth", "place_of_birth"],
  },
  {
    title: "Current Residence",
    keys: [
      "domisili_provinsi",
      "domisili_kota",
      "domisili_kecamatan",
      "domisili_kelurahan",
      "domisili_alamat",
    ],
  },
  {
    title: "Hometown",
    keys: [
      "asal_provinsi",
      "asal_kota",
      "asal_kecamatan",
      "asal_kelurahan",
      "asal_alamat",
    ],
  },
  {
    title: "Work Information",
    keys: ["business_unit", "job_role"],
  },
  {
    title: "Contact Information",
    keys: ["whatsapp_number", "npwp"],
  },
  {
    title: "Emergency Contact",
    keys: ["emergency_contact_name", "emergency_contact_whatsapp"],
  },
];

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, todayLog, settings] = await Promise.all([
    getCurrentProfile(),
    getTodayAttendance(),
    getCachedAttendanceSettings(),
  ]);

  if (profile?.role === "admin") redirect("/admin/attendance");

  const { lang, t } = await getDictionary();
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const today = format(new Date(), "EEEE, d MMMM", {
    locale: lang === "id" ? idLocale : undefined,
  });

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

  const missingSections = PROFILE_SECTIONS
    .filter(({ keys }) =>
      keys.some((k) => !profile?.[k as keyof typeof profile])
    )
    .map(({ title }) => title);

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h2 className="text-2xl font-semibold text-foreground">
          {t.dashboard.greeting.replace("{name}", firstName)}
        </h2>
        <p className="text-muted-foreground text-sm mt-0.5">{today}</p>
      </div>

      <ProfileCompletionCard missingSections={missingSections} />

      <Card className="border-0 shadow-sm animate-fade-up animate-fade-up-delay-1">
        <CardContent className="p-5 space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t.dashboard.attendanceSection}
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
            workEndTime={profile?.work_end_time ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
