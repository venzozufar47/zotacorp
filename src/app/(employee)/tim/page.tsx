export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyTeamCoachingNotes, getMyTeamTasks } from "@/lib/actions/team.actions";
import {
  getLeaveApprovalQueue,
  getRecentLeaveDecisions,
  listHaengbocakeColleagues,
  listInputableMembers,
} from "@/lib/actions/leave-requests.actions";
import { serverNowMs } from "@/lib/leave/constants";
import { getMyBriefingBranches, listRecentHuddles } from "@/lib/actions/team-minutes.actions";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { TeamBriefingPanel } from "@/components/team/TeamBriefingPanel";
import { LeaveApproverPanel } from "@/components/leave/LeaveParts";
import { isTeamLeader } from "@/lib/tasks/team-access";
import { PageHeader } from "@/components/shared/PageHeader";
import { TeamTasksView } from "@/components/team/TeamTasksView";
import { TeamCoachingNotesList } from "@/components/team/TeamCoachingNotesList";
import { WriteCoachingNoteCard } from "@/components/team/WriteCoachingNoteCard";
import {
  listEmployeesForGrievance,
  listGrievanceInbox,
  listMyFiledGrievances,
  listTrustedContactNames,
} from "@/lib/actions/grievances.actions";
import { EMPLOYEE_HOME_FEATURES as FEATURES } from "@/lib/features/employee-home";
import { GrievanceClient } from "@/components/grievances/GrievanceClient";
import { TeamHub, TeamSectionHeader, type TeamSection } from "@/components/team/TeamHub";

const SECTIONS: readonly TeamSection[] = ["izin", "briefing", "catatan", "tugas", "pengaduan"];

/**
 * Team leader — pilihan awal lima bagian (Perizinan, Briefing kilat, Catatan
 * pembinaan, Penugasan, Pengaduan), lalu isi bagian yang dipilih lewat `?bagian=`. Karyawan yang
 * bukan leader dialihkan ke beranda.
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

  // Karyawan biasa: tab Tim hanya berisi Pengaduan (laporan ke kepala tim, pihak tepercaya, atau Owner).
  if (!leader) {
    const [myReports, inbox, employees, trustedNames] = await Promise.all([
      listMyFiledGrievances(),
      listGrievanceInbox(),
      listEmployeesForGrievance(),
      listTrustedContactNames(),
    ]);
    return (
      <div className="space-y-5">
        <PageHeader title="Pengaduan" subtitle="Identitasmu dijaga bila kamu pilih kirim tanpa nama. Tidak ada pembalasan bagi pelapor beritikad baik." />
        <GrievanceClient
          myReports={myReports}
          inbox={inbox}
          employees={employees}
          isAdmin={false}
          trustedContacts={[]}
          trustedNames={trustedNames}
        />
      </div>
    );
  }

  const { bagian } = await searchParams;
  const section = SECTIONS.find((k) => k === bagian) ?? null;

  const [members, notes, leaveQueue, leaveDecisions, colleagues, inputMembers, briefings, myBranches, grievanceInbox, myReports, grievanceEmployees, trustedNames] = await Promise.all([
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
  ]);
  const todayYmd = jakartaDateString(new Date(serverNowMs()));

  const runningTasks = members.reduce(
    (n, m) => n + m.tasks.filter((t) => t.status !== "approved").length,
    0
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tim saya"
        subtitle={`${members.length} anggota — pilih yang ingin kamu urus.`}
      />

      {section === null ? (
        <TeamHub
          counts={{
            izin: { value: leaveQueue.length, label: "menunggu persetujuan", urgent: true },
            briefing: {
              value: briefings.filter(
                (b) => b.huddleDate === todayYmd && (myBranches.length === 0 || myBranches.includes(b.branch))
              ).length,
              label: "tercatat hari ini",
            },
            catatan: {
              value: notes.filter((n) => n.acknowledgedAt === null).length,
              label: "belum dibaca anggota",
            },
            tugas: { value: runningTasks, label: "tugas berjalan" },
            pengaduan: {
              value: grievanceInbox.filter((g) => g.status === "submitted").length,
              label: "belum dikonfirmasi",
              urgent: true,
            },
          }}
        />
      ) : (
        <>
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
          {section === "briefing" && <TeamBriefingPanel briefings={briefings} todayYmd={todayYmd} branches={myBranches} />}
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
            />
          )}
        </>
      )}
    </div>
  );
}
