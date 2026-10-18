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

/**
 * Team leader — memantau Tugas anggota tim (read-only). Karyawan yang bukan
 * leader dialihkan ke beranda.
 */
export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await isTeamLeader())) redirect("/dashboard");

  const [members, notes, leaveQueue, leaveDecisions, colleagues, inputMembers] = await Promise.all([
    getMyTeamTasks(),
    getMyTeamCoachingNotes(),
    getLeaveApprovalQueue(),
    getRecentLeaveDecisions(),
    listHaengbocakeColleagues(),
    listInputableMembers(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tim saya"
        subtitle={`${members.length} anggota — izin, catatan pembinaan, dan progres tugas.`}
      />
      <LeaveApproverPanel
        queue={leaveQueue}
        recentDecisions={leaveDecisions}
        colleagues={colleagues}
        inputMembers={inputMembers}
        nowMs={serverNowMs()}
      />
      <WriteCoachingNoteCard
        members={members.map((m) => ({ memberId: m.memberId, name: m.name }))}
      />
      <TeamCoachingNotesList notes={notes} />
      <TeamTasksView members={members} />
    </div>
  );
}
