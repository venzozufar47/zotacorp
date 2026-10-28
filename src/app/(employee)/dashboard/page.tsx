export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getCurrentProfile,
  getCachedAttendanceSettings,
} from "@/lib/supabase/cached";
import {
  getTodayAttendance,
  getMyStreak,
  getMyMissedCheckouts,
} from "@/lib/actions/attendance.actions";
import { MissedCheckoutCard } from "@/components/dashboard/MissedCheckoutCard";
import { attendanceAffectsPay } from "@/lib/payslip/attendance-gate";
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
import { CoachingNotesCard } from "@/components/dashboard/CoachingNotesCard";
import { LeaveRequestDialog } from "@/components/leave/LeaveRequestDialog";
import { CleaningRedoCard } from "@/components/dashboard/CleaningRedoCard";
import {
  listMyCoachingNotes,
  getMyPendingRedoPhotos,
} from "@/lib/actions/cleaning-review.actions";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { FloorTodayCard } from "@/components/dashboard/FloorTodayCard";
import { SelfCelebrationHero } from "@/components/dashboard/SelfCelebrationHero";
import { CelebrationsCard } from "@/components/dashboard/CelebrationsCard";
import { OpnameDashboardCard } from "@/components/procurement/OpnameDashboardCard";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { getDictionary } from "@/lib/i18n/server";
import { parseBreakWindows } from "@/lib/utils/break-windows";
import type { AttendanceBreakLog } from "@/lib/supabase/types";
import { getTodayCleaningTasks } from "@/lib/actions/cleaning.actions";
import { getMyOpenTasks } from "@/lib/actions/assigned-tasks.actions";
import { getMyPendingVerifications } from "@/lib/actions/verifications.actions";
import { getSocialReportReminder } from "@/lib/actions/social-report.actions";
import { SocialReportReminderCard } from "@/components/social/SocialReportReminderCard";
import { VerificationInbox } from "@/components/verification/VerificationInbox";
import { TaskAssignmentCard } from "@/components/dashboard/TaskAssignmentCard";
import { CleaningChecklistCard } from "@/components/cleaning/CleaningChecklistCard";
import { ServiceLevelPanel } from "@/components/dashboard/ServiceLevelPanel";
import { listMyServiceLevelOutlets } from "@/lib/pos/service-level-access";
import { canViewRevenueDashboard } from "@/lib/revenue-dashboard/access";
import { getRevenueSummaryForHome } from "@/lib/actions/admin-home.actions";
import { getYeoboSpaceRevenue } from "@/lib/actions/admin-home-yeobo.actions";
import { AdminRevenueCard } from "@/components/admin/home/AdminRevenueCard";
import { TicketResolutionPanel } from "@/components/dashboard/TicketResolutionPanel";
import { getMyPendingContract } from "@/lib/actions/employment-contracts.actions";
import {
  getMyOpenTicketsSummary,
  getStudioQueueCount,
  getStudioHeadRecentResolutionKpi,
  getBranchQueue,
} from "@/lib/actions/tickets.actions";
import { isStudioHead } from "@/lib/tickets/access";
import { BranchQueueCard } from "@/components/tickets/BranchQueueCard";
import Link from "next/link";
import { Brain, FileSignature, Ticket as TicketIcon, PackageSearch } from "lucide-react";
import { isProcurementStaff } from "@/lib/procurement/access";
import { getProcurementDashboardBadge,
  type ProcurementBadgeItem, } from "@/lib/actions/procurement.actions";
import { EMPLOYEE_HOME_FEATURES as FEATURES } from "@/lib/features/employee-home";
import { getPendingLeaveApprovalCountForMe } from "@/lib/actions/leave-requests.actions";
import { CalendarClock } from "lucide-react";
import { canFileComplaint } from "@/lib/actions/customer-complaints.actions";
import { MessageSquareWarning, FlaskConical } from "lucide-react";
import { ScorecardSection, ScorecardSectionSkeleton } from "@/components/scorecard/ScorecardSection";
import { Inbox, ShieldQuestion, ClipboardList as SurveyIcon } from "lucide-react";
import { hasAnsweredMonthlyPulse } from "@/lib/actions/pulse-survey.actions";
import { Wallet as BonusIcon } from "lucide-react";
import { countPendingSopAcknowledgments } from "@/lib/actions/sop-documents.actions";
import { BookCheck as SopIcon } from "lucide-react";

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
    branchQueue,
    studioQueueCount,
    isHeadOfStudio,
    serviceLevelOutlets,
    coachingNotes,
    cleaningRedoPhotos,
    ticketResolutionKpi,
    hasHaengbocakeRevenueAccess,
    hasYeoboRevenueAccess,
    missedCheckouts,
    payslipBasisRes,
    myTasks,
    pendingVerifications,
    socialReminder,
    pendingLeaveApprovals,
    canFileComplaintFlag,
    answeredMonthlyPulse,
    pendingSopCount,
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
    getBranchQueue(),
    getStudioQueueCount(),
    isStudioHead(),
    listMyServiceLevelOutlets(),
    listMyCoachingNotes(),
    getMyPendingRedoPhotos(),
    getStudioHeadRecentResolutionKpi(),
    canViewRevenueDashboard("haengbocake"),
    canViewRevenueDashboard("yeobo"),
    getMyMissedCheckouts(),
    supabase
      .from("payslip_settings")
      .select("calculation_basis")
      .eq("user_id", user.id)
      .maybeSingle(),
    getMyOpenTasks(),
    getMyPendingVerifications(),
    getSocialReportReminder().catch(() => null),
    // Kartu fitur baru disembunyikan (lihat EMPLOYEE_HOME_FEATURES): query-nya dilewati selagi mati.
    FEATURES.izin ? getPendingLeaveApprovalCountForMe() : Promise.resolve(0),
    FEATURES.keluhan || FEATURES.risetProduk ? canFileComplaint() : Promise.resolve(false),
    FEATURES.survei ? hasAnsweredMonthlyPulse() : Promise.resolve(true),
    FEATURES.pengakuanSop ? countPendingSopAcknowledgments() : Promise.resolve(0),
  ]);
  const [revenueSummary, yeoboRevenue] = await Promise.all([
    hasHaengbocakeRevenueAccess ? getRevenueSummaryForHome() : Promise.resolve(null),
    hasYeoboRevenueAccess ? getYeoboSpaceRevenue() : Promise.resolve(null),
  ]);
  const pendingContract = myPendingContract;

  if (profile?.role === "admin") redirect("/admin/attendance");

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const today = format(new Date(), "EEEE, d MMMM", {
    locale: lang === "id" ? idLocale : undefined,
  });

  const overtimeAdminNote = otReqRes.data?.admin_note ?? null;

  // Banner pengadaan — sengaja dihitung TERPISAH dan hanya untuk staf
  // pengadaan, supaya dashboard karyawan lain tidak ikut menanggung
  // biayanya (perhitungan ini menyapu seluruh bahan tiap unit bisnis).
  let procurementBadge: {
    needBuy: number;
    staleDays: number | null;
    items: ProcurementBadgeItem[];
  } | null = null;
  if (await isProcurementStaff()) {
    const res = await getProcurementDashboardBadge();
    if (res.ok) procurementBadge = res.data ?? null;
  }
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

      {/* Pengingat opname harian — hanya muncul untuk petugas pengadaan cabang yang memakai ritme harian. */}
      <Suspense fallback={null}>
        <OpnameDashboardCard />
      </Suspense>

      {/* Tugas dari admin (sekali-jalan, wajib foto + verifikasi). Memblokir
          sign out selama belum dikirim/ditunda, jadi ditaruh tinggi. Komponen
          menghilang sendiri saat kosong. */}
      <TaskAssignmentCard tasks={myTasks} />

      {/* Poin tugas / tiket yang menunjuk saya sebagai verifikator (verifikasi dua pihak). Hilang sendiri bila kosong. */}
      <VerificationInbox items={pendingVerifications} />

      {/* Pengingat laporan sosmed mingguan (hanya pengisi terdaftar; hilang sendiri bila lengkap). */}
      <SocialReportReminderCard reminder={socialReminder} />

      {/* Foto kebersihan yang perlu diperbaiki — di ATAS catatan pembinaan:
          ini yang mengunci sign-in/checkout (lihat hasPendingCleaningRedo),
          jadi lebih mendesak daripada catatan yang cuma perlu dibaca.
          Komponennya sendiri yang menghilang saat kosong. */}
      <CleaningRedoCard items={cleaningRedoPhotos} />

      {/* Hari lewat dengan sign in tapi belum sign out — memotong gaji
          prorata dan mengunci konfirmasi slip, jadi ditaruh tinggi. */}
      <MissedCheckoutCard
        items={missedCheckouts}
        affectsPay={attendanceAffectsPay(
          payslipBasisRes.data?.calculation_basis
        )}
        workEndTime={profile?.work_end_time ?? undefined}
        isFlexibleSchedule={profile?.is_flexible_schedule ?? false}
        timezone={settings?.timezone ?? undefined}
      />

      {/* Catatan pembinaan dari admin. Diletakkan tinggi: kalau ada, ia hal
          pertama yang perlu dibaca hari itu. Komponennya sendiri yang
          menghilang saat kosong. */}
      <CoachingNotesCard notes={coachingNotes} />

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
              {studioQueueCount} tiket menunggu ditangani
            </span>
            <span className="block text-xs text-muted-foreground">
              Tiket ditujukan kepadamu — ketuk untuk menindaklanjuti.
            </span>
          </span>
          <span className="text-sm font-bold shrink-0">→</span>
        </Link>
      )}

      {procurementBadge &&
        (procurementBadge.needBuy > 0 ||
          (procurementBadge.staleDays ?? 0) > 14) &&
        (() => {
          const { needBuy, staleDays, items } = procurementBadge;
          const first = items[0];
          const single = needBuy === 1 && first;
          // 1 bahan → langsung ke form Catat belanja dengan bahan itu terpilih; beberapa → papan Stok
          // (daftar yang bisa dipilih). Tanpa bahan kurang → ajakan opname.
          const href = needBuy > 0 && first
            ? single
              ? `/pengadaan?tab=catat&bu=${encodeURIComponent(first.businessUnit)}&bahan=${first.id}`
              : `/pengadaan?tab=stok&bu=${encodeURIComponent(first.businessUnit)}`
            : "/pengadaan/opname";
          const stockText = (i: ProcurementBadgeItem) =>
            i.status === "habis"
              ? "stok habis"
              : `sisa ±${(i.onHand ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })} ${i.usageUnit}`;
          const names = items.slice(0, 3).map((i) => i.name).join(", ");
          const more = needBuy - Math.min(items.length, 3);
          return (
            <Link
              href={href}
              className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-warning/40 px-4 py-3 shadow-hard-sm hover:bg-warning/60 transition"
            >
              <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-card shrink-0">
                <PackageSearch size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-display font-bold text-sm">
                  {needBuy > 0
                    ? single
                      ? `${first.name} perlu dibeli`
                      : `${needBuy} bahan perlu dibeli`
                    : `Opname bahan sudah ${staleDays} hari lalu`}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {needBuy > 0
                    ? single
                      ? `${first.businessUnit.replace("Haengbocake ", "")} · ${stockText(first)} · ketuk untuk catat belanja.`
                      : `${names}${more > 0 ? ` +${more} lainnya` : ""} · ketuk untuk memilih bahan.`
                    : "Ketuk untuk mulai opname."}
                  {needBuy > 0 && (staleDays ?? 0) > 14 && ` Opname terakhir ${staleDays} hari lalu.`}
                </span>
              </span>
              <span className="text-sm font-bold shrink-0">→</span>
            </Link>
          );
        })()}

      {FEATURES.izin && pendingLeaveApprovals > 0 && (
        <Link
          href="/tim"
          className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-warning/40 px-4 py-3 shadow-hard-sm hover:bg-warning/60 transition"
        >
          <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-card shrink-0">
            <CalendarClock size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-sm">
              {pendingLeaveApprovals} pengajuan izin menunggu persetujuanmu
            </span>
            <span className="block text-xs text-muted-foreground">
              Kamu atasan langsung pemohon — ketuk untuk tinjau.
            </span>
          </span>
          <span className="text-sm font-bold shrink-0">→</span>
        </Link>
      )}

      {myTicketsSummary.awaitingConfirmation > 0 && (
        <Link
          href="/tickets"
          className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-success/20 px-4 py-3 shadow-hard-sm hover:bg-success/30 transition"
        >
          <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-card shrink-0">
            <TicketIcon size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-sm">
              {myTicketsSummary.awaitingConfirmation} tiket menunggu konfirmasimu
            </span>
            <span className="block text-xs text-muted-foreground">
              Sudah ditandai selesai — cek & konfirmasi, atau tandai belum beres.
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

      {branchQueue.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TicketIcon size={15} />
            <span className="font-display font-bold text-sm">
              {branchQueue.length} tiket aktif di cabangmu
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Termasuk yang diajukan admin/owner atau rekan kerja lain.
          </p>
          {branchQueue.slice(0, 5).map((t) => (
            <BranchQueueCard key={t.id} ticket={t} />
          ))}
          {branchQueue.length > 5 && (
            <Link
              href="/tickets"
              className="block text-center text-xs font-semibold text-primary hover:underline"
            >
              +{branchQueue.length - 5} tiket aktif lainnya
            </Link>
          )}
        </div>
      )}

      <CelebrationsCard feed={celebrationsFeed} viewerId={user.id} />

      <CleaningChecklistCard initial={cleaningTasks} />

      {FEATURES.survei && !answeredMonthlyPulse && (
        <Link
          href="/survei"
          className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-primary/10 px-4 py-3 shadow-hard-sm hover:bg-primary/20 transition"
        >
          <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-card shrink-0">
            <SurveyIcon size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-sm">Survei bulanan (anonim)</span>
            <span className="block text-xs text-muted-foreground">
              3 pertanyaan, ±30 detik. Jawabanmu tidak tersimpan dengan nama.
            </span>
          </span>
          <span className="text-sm font-bold shrink-0">→</span>
        </Link>
      )}

      {FEATURES.pengakuanSop && pendingSopCount > 0 && (
        <Link
          href="/pengakuan-sop"
          className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-warning/40 px-4 py-3 shadow-hard-sm hover:bg-warning/60 transition"
        >
          <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-card shrink-0">
            <SopIcon size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-sm">
              {pendingSopCount} SOP belum kamu akui
            </span>
            <span className="block text-xs text-muted-foreground">
              Baca dan konfirmasi sudah memahami.
            </span>
          </span>
          <span className="text-sm font-bold shrink-0">→</span>
        </Link>
      )}

      {FEATURES.pengaduan && (
      <Link
        href="/tim?bagian=pengaduan"
        className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-card px-4 py-3 shadow-hard-sm hover:bg-muted transition"
      >
        <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-accent shrink-0">
          <ShieldQuestion size={18} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-display font-bold text-sm">Pengaduan</span>
          <span className="block text-xs text-muted-foreground">
            Lapor masalah — boleh tanpa nama, dijaga kerahasiaannya.
          </span>
        </span>
        <span className="text-sm font-bold shrink-0">→</span>
      </Link>
      )}

      {FEATURES.persetujuan && (
      <Link
        href="/persetujuan"
        className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-card px-4 py-3 shadow-hard-sm hover:bg-muted transition"
      >
        <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-accent shrink-0">
          <Inbox size={18} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-display font-bold text-sm">Persetujuan ke Owner</span>
          <span className="block text-xs text-muted-foreground">
            Ajukan usulan atau lihat status permintaanmu.
          </span>
        </span>
        <span className="text-sm font-bold shrink-0">→</span>
      </Link>
      )}

      {FEATURES.bonus && (
      <Link
        href="/bonus"
        className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-card px-4 py-3 shadow-hard-sm hover:bg-muted transition"
      >
        <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-accent shrink-0">
          <BonusIcon size={18} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-display font-bold text-sm">Bonus tim</span>
          <span className="block text-xs text-muted-foreground">
            Lihat rincian bonusmu dan cara hitungnya.
          </span>
        </span>
        <span className="text-sm font-bold shrink-0">→</span>
      </Link>
      )}

      {FEATURES.risetProduk && canFileComplaintFlag && (
        <Link
          href="/riset-produk"
          className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-card px-4 py-3 shadow-hard-sm hover:bg-muted transition"
        >
          <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-accent shrink-0">
            <FlaskConical size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-sm">Riset produk</span>
            <span className="block text-xs text-muted-foreground">
              Usulkan ide, catat percobaan, kelola tester dan kartu produk.
            </span>
          </span>
          <span className="text-sm font-bold shrink-0">→</span>
        </Link>
      )}

      {FEATURES.keluhan && canFileComplaintFlag && (
        <Link
          href="/keluhan"
          className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-card px-4 py-3 shadow-hard-sm hover:bg-muted transition"
        >
          <span className="grid place-items-center size-10 rounded-full border-2 border-foreground bg-accent shrink-0">
            <MessageSquareWarning size={18} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold text-sm">Keluhan & insiden pelanggan</span>
            <span className="block text-xs text-muted-foreground">
              Catat keluhan baru atau tutup yang masih terbuka.
            </span>
          </span>
          <span className="text-sm font-bold shrink-0">→</span>
        </Link>
      )}

      {/* Tanggung jawab berjalan, bukan aksi hari ini — jadi masuk
          kelompok panel substantif, bukan tumpukan banner di atas.
          Render sendiri nol kalau user bukan penanggung jawab. */}
      <ServiceLevelPanel outlets={serviceLevelOutlets} />

      {/* Kartu Omzet admin, ditunjukkan ke karyawan yang di-assign admin
          (revenue_dashboard_viewers) — data sama, reuse komponen admin
          apa adanya. Haengbocake & Yeobo di-assign TERPISAH (scope
          berbeda), jadi salah satu bisa null sementara yang lain terisi
          — kartu tetap tampil selama minimal satu scope diberikan. */}
      {(revenueSummary || yeoboRevenue) && (
        <AdminRevenueCard today={revenueSummary} yeobo={yeoboRevenue} />
      )}

      {/* Kartu KPI tiket — render sendiri nol kalau bukan atasan. */}
      <TicketResolutionPanel kpi={ticketResolutionKpi} />

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
          {/* Akses karyawan ke izin — tepat di bawah tombol
              absen karena itulah saat orang butuh (tak bisa masuk / mau keluar).
              Memakai saklar `izin` yang sama dengan banner atasan. */}
          {FEATURES.izin && <LeaveRequestDialog />}
        </div>
      </section>

      {/* Scorecard cabang — selalu tampil, sesuai cabang masing-masing; dihitung di luar jalur kritis. */}
      <Suspense fallback={<ScorecardSectionSkeleton />}>
        <ScorecardSection />
      </Suspense>

      <FloorTodayCard people={floorToday} />
    </div>
  );
}
