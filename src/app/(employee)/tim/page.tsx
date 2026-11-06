export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyTeamCoachingNotes, getMyTeamTasks } from "@/lib/actions/team.actions";
import { listMyCoachingNotes } from "@/lib/actions/cleaning-review.actions";
import {
  getLeaveApprovalQueue,
  getRecentLeaveDecisions,
  listHaengbocakeColleagues,
  listInputableMembers,
} from "@/lib/actions/leave-requests.actions";
import { serverNowMs } from "@/lib/leave/constants";
import { getMyBriefingBranches, listRecentHuddles } from "@/lib/actions/team-minutes.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { briefingTimeLabel } from "@/lib/team/briefing-labels";
import { MemberBriefingView, TeamBriefingPanel } from "@/components/team/TeamBriefingPanel";
import { LeaveApproverPanel } from "@/components/leave/LeaveParts";
import { isTeamLeader } from "@/lib/tasks/team-access";
import { PageHeader } from "@/components/shared/PageHeader";
import { TeamTasksView } from "@/components/team/TeamTasksView";
import { TeamCoachingNotesList } from "@/components/team/TeamCoachingNotesList";
import { WriteCoachingNoteCard } from "@/components/team/WriteCoachingNoteCard";
import { CoachingNotesCard } from "@/components/dashboard/CoachingNotesCard";
import {
  listEmployeesForGrievance,
  listGrievanceInbox,
  listMyFiledGrievances,
  listMyLeaderIds,
  listTrustedContactNames,
} from "@/lib/actions/grievances.actions";
import { EMPLOYEE_HOME_FEATURES as FEATURES } from "@/lib/features/employee-home";
import { GrievanceClient } from "@/components/grievances/GrievanceClient";
import {
  TeamAlertLink,
  TeamBriefingCard,
  TeamRowList,
  TeamSectionHeader,
  type TeamSection,
} from "@/components/team/TeamHub";

const LEADER_SECTIONS: readonly TeamSection[] = ["izin", "briefing", "catatan", "tugas", "pengaduan"];
const MEMBER_SECTIONS: readonly TeamSection[] = ["catatan", "pengaduan"];

/**
 * Halaman Tim, dua tampilan.
 *
 * Kepala tim: kartu briefing kilat di atas (aksi paling sering), lalu daftar
 * ringkas Izin, Catatan, Penugasan, Pengaduan dengan angka. Memilih satu
 * membuka bagiannya lewat `?bagian=` (alamat bisa dibagikan, tombol kembali
 * browser berfungsi).
 *
 * Karyawan biasa: peringatan catatan pembinaan yang belum dibaca (hanya bila
 * ada), briefing kilat cabangnya (baca-saja), dan jalur Pengaduan. Detail
 * catatan dan pengaduan dibuka lewat `?bagian=`.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ bagian?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const leader = await isTeamLeader();
  if (!leader && !FEATURES.pengaduan) redirect("/dashboard");

  const { bagian } = await searchParams;
  const todayYmd = jakartaDateString(new Date(serverNowMs()));

  if (!leader) {
    const section = MEMBER_SECTIONS.find((k) => k === bagian) ?? null;
    const [myNotes, myReports, inbox, employees, trustedNames, myLeaderIds, briefings, myBranches] = await Promise.all([
      listMyCoachingNotes().catch(() => []),
      listMyFiledGrievances(),
      listGrievanceInbox(),
      listEmployeesForGrievance(),
      listTrustedContactNames(),
      listMyLeaderIds(),
      listRecentHuddles().catch(() => []),
      getMyBriefingBranches().catch(() => []),
    ]);
    const activeNotes = myNotes.filter((n) => !n.archived);
    const unread = activeNotes.filter((n) => n.acknowledgedAt === null).length;

    if (section === "catatan") {
      return (
        <div className="space-y-4">
          <TeamSectionHeader section="catatan" />
          {activeNotes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Belum ada catatan pembinaan untukmu.
            </p>
          ) : (
            <CoachingNotesCard notes={myNotes} flat />
          )}
        </div>
      );
    }

    if (section === "pengaduan") {
      return (
        <div className="space-y-4">
          <TeamSectionHeader section="pengaduan" />
          <p className="text-xs text-muted-foreground">
            Identitasmu dijaga bila kamu pilih kirim tanpa nama. Tidak ada pembalasan bagi pelapor beritikad baik.
          </p>
          <GrievanceClient
            myReports={myReports}
            inbox={inbox}
            employees={employees}
            isAdmin={false}
            trustedContacts={[]}
            trustedNames={trustedNames}
            myLeaderIds={myLeaderIds}
          />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <PageHeader title="Tim" />
        {unread > 0 && (
          <TeamAlertLink href="/tim?bagian=catatan">
            {unread} catatan pembinaan belum kamu baca
          </TeamAlertLink>
        )}
        {/* Briefing hanya milik cabang; karyawan tanpa cabang terdeteksi (mis. unit lain) tidak melihat bagian ini. */}
        {myBranches.length > 0 && <MemberBriefingView briefings={briefings} todayYmd={todayYmd} />}
        <TeamRowList
          rows={[
            {
              key: "catatan",
              value: 0,
              label: activeNotes.length > 0 ? `${activeNotes.length} aktif` : undefined,
              hint: "Catatan dari atasanmu",
            },
            {
              key: "pengaduan",
              value: 0,
              label: myReports.length > 0 ? `${myReports.length} laporanmu` : undefined,
              hint: "Lapor, bisa tanpa nama",
            },
          ]}
        />
      </div>
    );
  }

  const section = LEADER_SECTIONS.find((k) => k === bagian) ?? null;

  const [members, notes, leaveQueue, leaveDecisions, colleagues, inputMembers, briefings, myBranches, grievanceInbox, myReports, grievanceEmployees, trustedNames, myLeaderIds] = await Promise.all([
    getMyTeamTasks(),
    getMyTeamCoachingNotes(),
    getLeaveApprovalQueue(),
    getRecentLeaveDecisions(),
    listHaengbocakeColleagues(),
    listInputableMembers(),
    listRecentHuddles(),
    getMyBriefingBranches(),
    listGrievanceInbox().catch(() => []),
    listMyFiledGrievances().catch(() => []),
    listEmployeesForGrievance().catch(() => []),
    listTrustedContactNames().catch(() => []),
    listMyLeaderIds().catch(() => []),
  ]);

  if (section !== null) {
    return (
      <div className="space-y-4">
        <TeamSectionHeader section={section} />
        {section === "izin" && (
          <LeaveApproverPanel
            queue={leaveQueue}
            recentDecisions={leaveDecisions}
            colleagues={colleagues}
            inputMembers={inputMembers}
            nowMs={serverNowMs()}
          />
        )}
        {section === "briefing" && (
          <TeamBriefingPanel briefings={briefings} todayYmd={todayYmd} branches={myBranches} />
        )}
        {section === "catatan" && (
          <>
            <WriteCoachingNoteCard
              members={members.map((m) => ({ memberId: m.memberId, name: m.name }))}
            />
            <TeamCoachingNotesList notes={notes} />
          </>
        )}
        {section === "tugas" && <TeamTasksView members={members} />}
        {section === "pengaduan" && (
          <GrievanceClient
            myReports={myReports}
            inbox={grievanceInbox}
            employees={grievanceEmployees}
            isAdmin={false}
            trustedContacts={[]}
            trustedNames={trustedNames}
            myLeaderIds={myLeaderIds}
          />
        )}
      </div>
    );
  }

  const runningTasks = members.reduce(
    (n, m) => n + m.tasks.filter((t) => t.status !== "approved").length,
    0
  );
  const todayBriefing =
    briefings.find(
      // Kartu ini menanyakan "sudah catat briefing timku?", jadi hanya briefing milik sendiri yang dihitung.
      (b) => b.mine && b.huddleDate === todayYmd && (myBranches.length === 0 || myBranches.includes(b.branch))
    ) ?? null;

  return (
    <div className="space-y-4">
      <PageHeader title="Tim saya" subtitle={`${members.length} anggota`} />
      <TeamBriefingCard
        branches={myBranches.length > 0 ? myBranches.join(" & ") : "Semua cabang"}
        postedBy={todayBriefing?.postedByName ?? null}
        time={todayBriefing ? briefingTimeLabel(todayBriefing.createdAt) : null}
      />
      <TeamRowList
        rows={[
          { key: "izin", value: leaveQueue.length, urgent: true, hint: "Menunggu persetujuanmu" },
          {
            key: "pengaduan",
            value: grievanceInbox.filter((g) => g.status === "submitted").length,
            urgent: true,
            hint: "Laporan anggota yang perlu dikonfirmasi",
          },
          {
            key: "catatan",
            value: notes.filter((n) => n.acknowledgedAt === null).length,
            hint: "Belum dibaca anggota",
          },
          { key: "tugas", value: runningTasks, hint: "Tugas anggota yang berjalan" },
        ]}
      />
    </div>
  );
}
