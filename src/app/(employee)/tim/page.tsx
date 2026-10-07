export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyTeamTasks } from "@/lib/actions/team.actions";
import { isTeamLeader } from "@/lib/tasks/team-access";
import { PageHeader } from "@/components/shared/PageHeader";
import { TeamTasksView } from "@/components/team/TeamTasksView";

/**
 * Team leader — memantau Tugas anggota tim (read-only). Karyawan yang bukan
 * leader dialihkan ke beranda.
 */
export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!(await isTeamLeader())) redirect("/dashboard");

  const members = await getMyTeamTasks();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tim saya"
        subtitle={`${members.length} anggota — pantau checklist tugas dan progresnya.`}
      />
      <TeamTasksView members={members} />
    </div>
  );
}
