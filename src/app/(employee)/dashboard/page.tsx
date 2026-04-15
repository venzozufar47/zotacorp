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
import { ExtraWorkButton } from "@/components/attendance/ExtraWorkButton";
import { AttendanceStatusCard } from "@/components/attendance/AttendanceStatusCard";
import { ProfileCompletionCard } from "@/components/profile/ProfileCompletionCard";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
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

  // Today's extra-work entries — only fetched when the per-user feature
  // flag is on so disabled accounts don't hit the table at all.
  let extraWorkToday: { id: string; kind: string; created_at: string }[] = [];
  if (profile?.extra_work_enabled) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("extra_work_logs")
      .select("id, kind, created_at")
      .eq("user_id", user.id)
      .eq("date", format(new Date(), "yyyy-MM-dd"))
      .order("created_at", { ascending: false });
    extraWorkToday = data ?? [];
  }

  const missingSections = PROFILE_SECTIONS
    .filter(({ keys }) =>
      keys.some((k) => !profile?.[k as keyof typeof profile])
    )
    .map(({ title }) => title);

  return (
    <div className="space-y-5">
      <DashboardHero
        firstName={firstName}
        dateLabel={today}
        timezone={settings?.timezone ?? null}
        motto={profile?.motto ?? null}
      />

      <ProfileCompletionCard missingSections={missingSections} />

      {/* Attendance — magazine-style section with an eyebrow label and a soft
          white panel that floats above the page background. The section
          label sits *outside* the card so the card's content gets the full
          breathing room. */}
      <section
        aria-label={t.dashboard.attendanceSection}
        className="animate-fade-up animate-fade-up-delay-1"
      >
        <div className="flex items-center justify-between px-1 mb-2.5">
          <span className="eyebrow text-muted-foreground">
            {t.dashboard.attendanceSection}
          </span>
          <span
            aria-hidden
            className="h-px flex-1 ml-3 bg-gradient-to-r from-border to-transparent"
          />
        </div>
        <div className="panel-soft p-5 space-y-4">
          <AttendanceStatusCard
            log={todayLog}
            timezone={settings?.timezone}
            overtimeAdminNote={overtimeAdminNote}
          />
          <CheckInButton
            todayLog={todayLog}
            settings={settings}
            isFlexible={profile?.is_flexible_schedule ?? false}
            workStartTime={profile?.work_start_time ?? null}
            workEndTime={profile?.work_end_time ?? null}
          />
          {profile?.extra_work_enabled && (
            <ExtraWorkButton todayEntries={extraWorkToday} />
          )}
        </div>
      </section>
    </div>
  );
}
