export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyTicketRole } from "@/lib/tickets/access";
import {
  getMyTickets,
  getAssignedToMe,
  getStudioQueue,
  getStudioHeadKpi,
  getBranchQueue,
  getMyChainLevels,
  getTicketFormOptions,
} from "@/lib/actions/tickets.actions";
import { TicketingSystem } from "@/components/tickets/TicketingSystem";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";

export default async function TicketsPage() {
  const [user, role] = await Promise.all([getCurrentUser(), getMyTicketRole()]);
  if (!user || !role) redirect("/dashboard");

  const isManager = role === "head" || role === "owner";
  const [myTickets, assignedToMe, studioQueue, branchQueue, kpi, myLevels, formOptions] = await Promise.all([
    getMyTickets(),
    getAssignedToMe(),
    isManager ? getStudioQueue() : Promise.resolve([]),
    role === "filer" ? getBranchQueue() : Promise.resolve([]),
    isManager ? getStudioHeadKpi() : Promise.resolve(null),
    getMyChainLevels(),
    getTicketFormOptions(),
  ]);

  return (
    <>
      <RealtimeRefresher channel="tickets-emp" table="tickets" />
      <TicketingSystem
        viewerRole={role}
        uid={user.id}
        myTickets={myTickets}
        assignedToMe={assignedToMe}
        studioQueue={studioQueue}
        branchQueue={branchQueue}
        kpi={kpi}
        myLevels={myLevels}
        formOptions={formOptions}
        backHref="/dashboard"
      />
    </>
  );
}
