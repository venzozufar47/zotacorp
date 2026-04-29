import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { RouteProgressBar } from "@/components/ui/RouteProgressBar";
import { listMyAssignedBankAccountIds } from "@/lib/actions/cashflow.actions";
import { getCurrentProfile } from "@/lib/supabase/cached";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Expose "Keuangan" in the rail only when the user is actually
  // assigned to at least one rekening. Cheap single-column query; RLS
  // scopes to the current user.
  const [assignedIds, profile] = await Promise.all([
    listMyAssignedBankAccountIds(),
    getCurrentProfile(),
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
      <Sidebar className="hidden md:flex" hasFinance={hasFinance} me={me} />
      <main className="flex-1 min-w-0">
        <div className="max-w-[1700px] mx-auto px-4 py-6 pb-24 md:px-6 md:pb-8">
          {children}
        </div>
      </main>
      <BottomNav hasFinance={hasFinance} me={me} />
    </div>
  );
}
