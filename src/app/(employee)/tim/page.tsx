export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyTeamCoachingNotes, getMyTeamTasks } from "@/lib/actions/team.actions";
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

  const [members, notes] = await Promise.all([getMyTeamTasks(), getMyTeamCoachingNotes()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tim saya"
        subtitle={`${members.length} anggota — pantau checklist tugas dan progresnya.`}
      />
      <WriteCoachingNoteCard
        members={members.map((m) => ({ memberId: m.memberId, name: m.name }))}
      />
      <TeamCoachingNotesList notes={notes} />
      <TeamTasksView members={members} />
    </div>
  );
}
