export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  getMyLeaveRequests,
  getLeaveApprovalQueue,
  getMyLeaderNames,
  getRecentLeaveDecisions,
  listHaengbocakeColleagues,
} from "@/lib/actions/leave-requests.actions";
import { isTeamLeader } from "@/lib/tasks/team-access";
import { serverNowMs } from "@/lib/leave/constants";
import { LeaveClient } from "@/components/leave/LeaveClient";

export default async function IzinPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const [myRequests, approvalQueue, recentDecisions, colleagues, leaderNames, role, leader] =
    await Promise.all([
      getMyLeaveRequests(),
      getLeaveApprovalQueue(),
      getRecentLeaveDecisions(),
      listHaengbocakeColleagues(),
      getMyLeaderNames(),
      getCurrentRole(),
      isTeamLeader(),
    ]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className="rounded-full p-2 hover:bg-muted text-muted-foreground"
          aria-label="Kembali"
        >
          <ArrowLeft size={18} strokeWidth={2.5} />
        </Link>
        <h1 className="font-display text-xl font-extrabold tracking-tight leading-none">
          Izin<span className="text-primary">.</span>
        </h1>
      </div>
      <LeaveClient
        myRequests={myRequests}
        approvalQueue={approvalQueue}
        recentDecisions={recentDecisions}
        colleagues={colleagues}
        leaderNames={leaderNames}
        canApprove={role === "admin" || leader}
        nowMs={serverNowMs()}
      />
    </div>
  );
}
