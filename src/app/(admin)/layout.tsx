import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminMobileNav } from "@/components/layout/AdminMobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { getCurrentRole } from "@/lib/supabase/cached";
import { listMyAssignedBankAccountIds } from "@/lib/actions/cashflow.actions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Non-admin users only reach pages under (admin) via the finance
  // carve-out (see middleware). When that happens, they're a cash-
  // rekening assignee — render the employee chrome instead of the
  // admin sidebar so their shell matches the rest of their experience.
  const role = await getCurrentRole();
  const isAdmin = role === "admin";

  if (!isAdmin) {
    const assignedIds = await listMyAssignedBankAccountIds();
    const hasFinance = assignedIds.length > 0;
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar className="hidden md:flex" hasFinance={hasFinance} />
        <main className="flex-1 min-w-0">
          <div className="max-w-[1700px] mx-auto px-4 py-6 pb-24 md:px-6 md:pb-8">
            {children}
          </div>
        </main>
        <BottomNav hasFinance={hasFinance} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AdminMobileNav />
      <AdminSidebar />
      <main className="flex-1 min-w-0">
        {/* Fluid width with a ceiling at ~1700px so the admin data tables
            breathe on 1440p / 1920p monitors instead of hitting a narrow
            6xl cap, while still keeping line lengths readable on ultra-
            wide displays. `min-w-0` on <main> above lets this grow past
            its flex sibling's intrinsic width. */}
        <div className="max-w-[1700px] mx-auto px-4 pt-16 pb-6 md:px-6 md:pt-6">{children}</div>
      </main>
    </div>
  );
}
