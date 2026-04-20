import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { listMyAssignedBankAccountIds } from "@/lib/actions/cashflow.actions";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Expose "Keuangan" in the rail only when the user is actually
  // assigned to at least one rekening. Cheap single-column query; RLS
  // scopes to the current user.
  const assignedIds = await listMyAssignedBankAccountIds();
  const hasFinance = assignedIds.length > 0;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar className="hidden md:flex" hasFinance={hasFinance} />
      <main className="flex-1 min-w-0">
        {/* Matches the admin layout's fluid cap so the attendance history
            table gets room to breathe on 1440p / 1920p monitors. Pages
            designed for phone-shaped layouts (profile, dashboard, etc.)
            can still wrap their own content in a narrower `max-w-2xl` if
            they want the original feel on wide screens. */}
        <div className="max-w-[1700px] mx-auto px-4 py-6 pb-24 md:px-6 md:pb-8">
          {children}
        </div>
      </main>
      <BottomNav hasFinance={hasFinance} />
    </div>
  );
}
