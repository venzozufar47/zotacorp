export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import {
  getMyTickets,
  getAssignedToMe,
  getStudioQueue,
  getStudioHeadKpi,
  getHierarchyAdmin,
  getTicketFormOptions,
} from "@/lib/actions/tickets.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { TicketingSystem } from "@/components/tickets/TicketingSystem";
import { HierarchyManager } from "@/components/tickets/HierarchyManager";
import { RealtimeRefresher } from "@/components/shared/RealtimeRefresher";

export default async function AdminTicketsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [myTickets, assignedToMe, studioQueue, kpi, hierarchy, formOptions] = await Promise.all([
    getMyTickets(),
    getAssignedToMe(),
    getStudioQueue(),
    getStudioHeadKpi(),
    getHierarchyAdmin(),
    getTicketFormOptions(),
  ]);

  return (
    <div className="space-y-6">
      <RealtimeRefresher channel="tickets-admin" table="tickets" />
      {/* z-20, bukan z-40: harus di atas konten di bawahnya tapi TETAP di bawah topbar admin sticky (z-30), kalau tidak
          judul halaman menimpa topbar saat di-scroll. */}
      <div className="relative z-20">
        <PageHeader
          title="Tiket"
          subtitle="Eskalasi, tiket ke karyawan, pemantauan semua cabang, dan pengaturan hierarki penanganan."
          action={hierarchy ? <HierarchyManager data={hierarchy} /> : undefined}
        />
      </div>
      <TicketingSystem
        viewerRole="owner"
        uid={user.id}
        myTickets={myTickets}
        assignedToMe={assignedToMe}
        studioQueue={studioQueue}
        kpi={kpi}
        formOptions={formOptions}
      />
    </div>
  );
}
