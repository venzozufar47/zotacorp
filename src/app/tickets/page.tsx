export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyTicketRole } from "@/lib/tickets/access";
import {
  getMyTickets,
  getStudioQueue,
  getEscalatedForOwner,
  getStudioHeadKpi,
} from "@/lib/actions/tickets.actions";
import { TicketingSystem } from "@/components/tickets/TicketingSystem";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";

export default async function TicketsPage() {
  const [user, role] = await Promise.all([getCurrentUser(), getMyTicketRole()]);
  if (!user || !role) redirect("/dashboard");

  const isManager = role === "head" || role === "owner";
  const [myTickets, studioQueue, escalated, kpi] = await Promise.all([
    getMyTickets(),
    isManager ? getStudioQueue() : Promise.resolve([]),
    role === "owner" ? getEscalatedForOwner() : Promise.resolve([]),
    isManager ? getStudioHeadKpi() : Promise.resolve(null),
  ]);

  return (
    <>
      <RealtimeRefresher channel="tickets-emp" table="tickets" />
      <TicketingSystem
        viewerRole={role}
        uid={user.id}
        myTickets={myTickets}
        studioQueue={studioQueue}
        escalated={escalated}
        kpi={kpi}
        backHref="/dashboard"
      />
    </>
  );
}
