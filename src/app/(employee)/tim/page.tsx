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
import { LeaveApproverPanel } from "@/components/leave/LeaveParts";
import { isTeamLeader } from "@/lib/tasks/team-access";
import { PageHeader } from "@/components/shared/PageHeader";
import { TeamTasksView } from "@/components/team/TeamTasksView";
import { TeamCoachingNotesList } from "@/components/team/TeamCoachingNotesList";
import { WriteCoachingNoteCard } from "@/components/team/WriteCoachingNoteCard";
import { TeamHub, TeamSectionHeader, type TeamSection } from "@/components/team/TeamHub";

const SECTIONS: readonly TeamSection[] = ["izin", "catatan", "tugas"];

/**
 * Team leader — pilihan awal tiga bagian (Perizinan, Catatan pembinaan,
 * Penugasan), lalu isi bagian yang dipilih lewat `?bagian=`. Karyawan yang
 * bukan leader dialihkan ke beranda.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ bagian?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await isTeamLeader())) redirect("/dashboard");

  const { bagian } = await searchParams;
  const section = SECTIONS.find((k) => k === bagian) ?? null;

  const [members, notes, leaveQueue, leaveDecisions, colleagues, inputMembers] = await Promise.all([
    getMyTeamTasks(),
    getMyTeamCoachingNotes(),
    getLeaveApprovalQueue(),
    getRecentLeaveDecisions(),
    listHaengbocakeColleagues(),
    listInputableMembers(),
  ]);

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
            catatan: {
              value: notes.filter((n) => n.acknowledgedAt === null).length,
              label: "belum dibaca anggota",
            },
            tugas: { value: runningTasks, label: "tugas berjalan" },
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
          {section === "catatan" && (
            <>
              <WriteCoachingNoteCard
                members={members.map((m) => ({ memberId: m.memberId, name: m.name }))}
              />
              <TeamCoachingNotesList notes={notes} />
            </>
          )}
          {section === "tugas" && <TeamTasksView members={members} />}
        </>
      )}
    </div>
  );
}
