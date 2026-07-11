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
import { getFloorToday } from "@/lib/actions/admin-home.actions";
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
import { FloorTodayCard } from "@/components/dashboard/FloorTodayCard";
import { SelfCelebrationHero } from "@/components/dashboard/SelfCelebrationHero";
import { CelebrationsCard } from "@/components/dashboard/CelebrationsCard";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { getDictionary } from "@/lib/i18n/server";
import { parseBreakWindows } from "@/lib/utils/break-windows";
import type { AttendanceBreakLog } from "@/lib/supabase/types";
import { getTodayCleaningTasks } from "@/lib/actions/cleaning.actions";
import { CleaningChecklistCard } from "@/components/cleaning/CleaningChecklistCard";
import { getMyPendingContract } from "@/lib/actions/employment-contracts.actions";
import {
  getMyOpenTicketsSummary,
  getStudioQueueCount,
} from "@/lib/actions/tickets.actions";
import { isStudioHead } from "@/lib/tickets/access";
import Link from "next/link";
import { Brain, FileSignature, Ticket as TicketIcon } from "lucide-react";

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
  if (!user) redirect("/");

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
    floorToday,
    breakLogsRes,
    cleaningTasks,
    extraWorkKinds,
    myPendingContract,
    myTicketsSummary,
    studioQueueCount,
    isHeadOfStudio,
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
    getFloorToday(),
    supabase
      .from("attendance_break_logs")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", todayDate)
      .order("break_out_at", { ascending: true }),
    getTodayCleaningTasks(),
    listExtraWorkKindsForUser(user.id),
    getMyPendingContract(),
    getMyOpenTicketsSummary(),
    getStudioQueueCount(),
    isStudioHead(),
  ]);
  const pendingContract = myPendingContract;

  if (profile?.role === "admin") redirect("/admin/attendance");

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const today = format(new Date(), "EEEE, d MMMM", {
    locale: lang === "id" ? idLocale : undefined,
  });

  const overtimeAdminNote = otReqRes.data?.admin_note ?? null;
  // Feature gating sekarang lewat assignment kind ke user (admin atur
  // di /admin/settings → Kerjaan tambahan). Karyawan tanpa assignment
  // = dropdown kosong = tombol tidak muncul.
  const extraWorkKindNames = extraWorkKinds.map((k) => k.name);
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

      {pendingContract && (
        <Link
          href="/kontrak"
          className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-warning/40 px-4 py-3 shadow-hard-sm hover:bg-warning/60 transition"
        >
          <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-card shrink-0">
            <FileSignature size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-sm">
              {pendingContract.isUpdate
                ? "Kontrak kerja diperbarui — perlu tanda tangan ulang"
                : "Kontrak kerja menunggu tanda tangan"}
            </span>
            <span className="block text-xs text-muted-foreground">
              {pendingContract.isUpdate
                ? pendingContract.updateNote
                  ? `Perubahan: ${pendingContract.updateNote} Ketuk untuk baca & tanda tangani ulang.`
                  : "Ada perubahan pada kontrakmu. Ketuk untuk baca & tanda tangani ulang."
                : "Tandatangani kontrakmu. Ketuk untuk membuka."}
            </span>
          </span>
          <span className="text-sm font-bold shrink-0">→</span>
        </Link>
      )}

      {profile?.disc_test_required && (
        <Link
          href="/disc"
          className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-warning/40 px-4 py-3 shadow-hard-sm hover:bg-warning/60 transition"
        >
          <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-card shrink-0">
            <Brain size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-sm">
              Kamu diminta mengambil Tes Kepribadian DISC
            </span>
            <span className="block text-xs text-muted-foreground">
              ±10 menit. Slip gaji terkunci sampai tes selesai — ketuk untuk mulai.
            </span>
          </span>
          <span className="text-sm font-bold shrink-0">→</span>
        </Link>
      )}

      {isHeadOfStudio && studioQueueCount > 0 && (
        <Link
          href="/tickets"
          className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-warning/40 px-4 py-3 shadow-hard-sm hover:bg-warning/60 transition"
        >
          <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-card shrink-0">
            <TicketIcon size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-sm">
              {studioQueueCount} tiket studio menunggu ditangani
            </span>
            <span className="block text-xs text-muted-foreground">
              Kamu Kepala Studio — ketuk untuk menindaklanjuti.
            </span>
          </span>
          <span className="text-sm font-bold shrink-0">→</span>
        </Link>
      )}

      {myTicketsSummary.openCount > 0 && (
        <Link
          href="/tickets"
          className="flex items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-3 shadow-hard-sm hover:bg-muted transition"
        >
          <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-accent shrink-0">
            <TicketIcon size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-sm">
              {myTicketsSummary.openCount} tiket kamu sedang diproses
            </span>
            <span className="block text-xs text-muted-foreground">
              Ketuk untuk lihat status & lampiran.
            </span>
          </span>
          <span className="text-sm font-bold shrink-0">→</span>
        </Link>
      )}

      <CelebrationsCard feed={celebrationsFeed} viewerId={user.id} />

      <CleaningChecklistCard initial={cleaningTasks} />

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
            breakEnabled={profile?.break_enabled ?? false}
            breakWindows={parseBreakWindows(profile?.break_windows)}
            breakLogs={(breakLogsRes.data ?? []) as AttendanceBreakLog[]}
          />
          {extraWorkKindNames.length > 0 && (
            <ExtraWorkButton todayEntries={extraWorkToday} kinds={extraWorkKindNames} />
          )}
        </div>
      </section>

      <FloorTodayCard people={floorToday} />
    </div>
  );
}
