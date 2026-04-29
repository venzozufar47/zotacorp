export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getCurrentProfile,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import { getTodayAttendance, getMyStreak } from "@/lib/actions/attendance.actions";
import { listExtraWorkKindsForUser } from "@/lib/actions/extra-work-kinds.actions";
import {
  getCelebrationsFeed,
  dispatchTodaysGreetings,
} from "@/lib/actions/celebrations.actions";
import { CheckInButton } from "@/components/attendance/CheckInButton";
import { ExtraWorkButton } from "@/components/attendance/ExtraWorkButton";
import { AttendanceStatusCard } from "@/components/attendance/AttendanceStatusCard";
import { ProfileCompletionCard } from "@/components/profile/ProfileCompletionCard";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { SelfCelebrationHero } from "@/components/dashboard/SelfCelebrationHero";
import { CelebrationsCard } from "@/components/dashboard/CelebrationsCard";
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

  // Single parallel fetch — no sequential waterfalls. The overtime and
  // extra-work queries are cheap even when their results go unused, and
  // Supabase RLS scopes them to the current user automatically.
  const supabase = await createClient();
  const todayDate = format(new Date(), "yyyy-MM-dd");

  const [
    profile,
    todayLog,
    settings,
    streak,
    { lang, t },
    otReqRes,
    extraWorkRes,
    celebrationsFeed,
  ] = await Promise.all([
    getCurrentProfile(),
    getTodayAttendance(),
    getCachedAttendanceSettings(),
    getMyStreak(),
    getDictionary(),
    supabase
      .from("overtime_requests")
      .select("admin_note, attendance_log_id")
      .eq("user_id", user.id)
      .eq("date", todayDate)
      .maybeSingle(),
    supabase
      .from("extra_work_logs")
      .select("id, kind, notes, created_at")
      .eq("user_id", user.id)
      .eq("date", todayDate)
      .order("created_at", { ascending: false }),
    getCelebrationsFeed(),
  ]);

  if (profile?.role === "admin") redirect("/admin/attendance");

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const today = format(new Date(), "EEEE, d MMMM", {
    locale: lang === "id" ? idLocale : undefined,
  });

  const overtimeAdminNote = otReqRes.data?.admin_note ?? null;
  // Feature gating sekarang lewat assignment kind ke user (admin atur
  // di /admin/settings → Kerjaan tambahan). Karyawan tanpa assignment
  // = dropdown kosong = tombol tidak muncul.
  const extraWorkKindNames = (await listExtraWorkKindsForUser(user.id)).map(
    (k) => k.name
  );
  const extraWorkToday =
    extraWorkKindNames.length > 0 ? (extraWorkRes.data ?? []) : [];

  const missingSections = PROFILE_SECTIONS
    .filter(({ keys }) =>
      keys.some((k) => !profile?.[k as keyof typeof profile])
    )
    .map(({ title }) => title);

  // Kick off WhatsApp dispatch after the response is streamed. Safe to
  // call on every dashboard render because `dispatchTodaysGreetings`
  // uses an atomic UPDATE ... RETURNING claim per celebrant.
  after(async () => {
    try {
      await dispatchTodaysGreetings();
    } catch {
      // dispatcher already swallows per-user errors; top-level guard for
      // anything that slips through so the response isn't affected.
    }
  });

  const selfCelebration = celebrationsFeed.mySelfCelebration;

  return (
    <div className="space-y-5">
      {selfCelebration ? (
        <SelfCelebrationHero
          celebration={selfCelebration}
          firstName={firstName}
          dateLabel={today}
          timezone={settings?.timezone ?? null}
        />
      ) : (
        <DashboardHero
          firstName={firstName}
          dateLabel={today}
          timezone={settings?.timezone ?? null}
          motto={profile?.motto ?? null}
        />
      )}

      <ProfileCompletionCard missingSections={missingSections} />

      <CelebrationsCard feed={celebrationsFeed} viewerId={user.id} />

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
        <div className="panel-sticker p-5 space-y-4">
          <AttendanceStatusCard
            log={todayLog}
            timezone={settings?.timezone}
            overtimeAdminNote={overtimeAdminNote}
            streak={streak}
          />
          <CheckInButton
            todayLog={todayLog}
            settings={settings}
            isFlexible={profile?.is_flexible_schedule ?? false}
            workStartTime={profile?.work_start_time ?? null}
            workEndTime={profile?.work_end_time ?? null}
          />
          {extraWorkKindNames.length > 0 && (
            <ExtraWorkButton todayEntries={extraWorkToday} kinds={extraWorkKindNames} />
          )}
        </div>
      </section>
    </div>
  );
}
