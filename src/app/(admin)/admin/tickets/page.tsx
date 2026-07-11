export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  getMyTickets,
  getStudioQueue,
  getEscalatedForOwner,
  getStudioHeadKpi,
  listStudioHeads,
  listEligibleStudioHeads,
} from "@/lib/actions/tickets.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { TicketingSystem } from "@/components/tickets/TicketingSystem";
import { StudioHeadsManager } from "@/components/tickets/StudioHeadsManager";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";

export default async function AdminTicketsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [myTickets, studioQueue, escalated, kpi, heads, eligible] =
    await Promise.all([
      getMyTickets(),
      getStudioQueue(),
      getEscalatedForOwner(),
      getStudioHeadKpi(),
      listStudioHeads(),
      listEligibleStudioHeads(),
    ]);

  return (
    <div className="space-y-6">
      <RealtimeRefresher channel="tickets-admin" table="tickets" />
      <PageHeader
        title="Tiket Studio"
        subtitle="Antrian eskalasi, pemantauan tiket Yeobo Space, dan penunjukan Kepala Studio."
      />
      <StudioHeadsManager heads={heads} eligible={eligible} />
      <TicketingSystem
        viewerRole="owner"
        uid={user.id}
        myTickets={myTickets}
        studioQueue={studioQueue}
        escalated={escalated}
        kpi={kpi}
      />
    </div>
  );
}
