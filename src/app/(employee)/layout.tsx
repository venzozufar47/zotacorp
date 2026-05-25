import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { RouteProgressBar } from "@/components/ui/RouteProgressBar";
import { listMyAssignedBankAccountIds } from "@/lib/actions/cashflow.actions";
import { countMyAssignments } from "@/lib/actions/cashflow-assignments.actions";
import { getCurrentProfile } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Expose conditional tabs (Keuangan / Pesanan Cake / Produksi Cake)
  // only when the user actually has access. All four queries run in
  // parallel — each is a cheap indexed lookup scoped to the current
  // user via RLS.
  const [assignedIds, profile, cakeAccess, assignmentCount] = await Promise.all([
    listMyAssignedBankAccountIds(),
    getCurrentProfile(),
    getMyCakeAccess(),
    countMyAssignments(),
  ]);
  const hasFinance = assignedIds.length > 0;
  const me = profile
    ? {
        id: profile.id,
        full_name: profile.full_name ?? null,
        avatar_url: profile.avatar_url ?? null,
        avatar_seed: profile.avatar_seed ?? null,
      }
    : null;

  return (
    <div className="flex min-h-screen bg-background">
      <RouteProgressBar />
      <Sidebar
        className="hidden md:flex"
        hasFinance={hasFinance}
        hasCakeOrders={cakeAccess.hasOrders}
        hasCakeProduction={cakeAccess.hasProduction}
        assignmentCount={assignmentCount}
        me={me}
      />
      <main className="flex-1 min-w-0">
        <div className="max-w-[1700px] mx-auto px-4 py-6 pb-24 md:px-6 md:pb-8">
          {children}
        </div>
      </main>
      <BottomNav
        hasFinance={hasFinance}
        hasCakeOrders={cakeAccess.hasOrders}
        hasCakeProduction={cakeAccess.hasProduction}
        assignmentCount={assignmentCount}
        me={me}
      />
    </div>
  );
}
