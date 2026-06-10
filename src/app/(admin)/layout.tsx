import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminTopbar } from "@/components/layout/AdminTopbar";
import { AdminMobileNav } from "@/components/layout/AdminMobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { RouteProgressBar } from "@/components/ui/RouteProgressBar";
import { getCurrentRole, getCurrentProfile } from "@/lib/supabase/cached";
import { listMyAssignedBankAccountIds, hasAssignedCashDashboard } from "@/lib/cashflow/access";
import { getPendingConfirmations } from "@/lib/actions/pending-confirmations.actions";
import { listOpenPayslipDisputes } from "@/lib/actions/payslip-disputes.actions";
import { isYeoboBoothAdmin } from "@/lib/yeobo-booth/access";

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
    // Yeobo Booth admin (non-global) juga reach /admin via carve-out
    // di middleware. Render admin chrome (sidebar terbatas auto by
    // AdminSidebar filter) supaya UX konsisten dengan admin Zota.
    const isYbAdmin = await isYeoboBoothAdmin();
    if (isYbAdmin) {
      const profile = await getCurrentProfile();
      return (
        <div className="flex min-h-screen bg-background">
          <RouteProgressBar />
          <AdminMobileNav pendingConfirmations={[]} />
          <AdminSidebar
            pendingCount={0}
            disputesCount={0}
            profile={profile}
            scope="yeobo-booth"
          />
          <main className="flex-1 min-w-0 flex flex-col">
            <AdminTopbar pendingConfirmations={[]} />
            <div className="flex-1 max-w-[1700px] w-full mx-auto px-4 pt-16 pb-24 md:px-6 md:pt-6 md:pb-6">
              {children}
            </div>
          </main>
        </div>
      );
    }

    const [assignedIds, hasCash] = await Promise.all([
      listMyAssignedBankAccountIds(),
      hasAssignedCashDashboard(),
    ]);
    const hasFinance = assignedIds.length > 0;
    return (
      <div className="flex min-h-screen bg-background">
        <RouteProgressBar />
        <Sidebar className="hidden md:flex" hasFinance={hasFinance} hasCash={hasCash} />
        <main className="flex-1 min-w-0">
          <div className="max-w-[1700px] mx-auto px-4 py-6 pb-24 md:px-6 md:pb-8">
            {children}
          </div>
        </main>
        <BottomNav hasFinance={hasFinance} hasCash={hasCash} />
      </div>
    );
  }

  const [pendingConfirmations, disputes, profile] = await Promise.all([
    getPendingConfirmations(),
    listOpenPayslipDisputes(),
    getCurrentProfile(),
  ]);

  return (
    <div className="flex min-h-screen bg-background">
      <RouteProgressBar />
      <AdminMobileNav pendingConfirmations={pendingConfirmations} />
      <AdminSidebar
        pendingCount={pendingConfirmations.length}
        disputesCount={disputes.length}
        profile={profile}
      />
      <main className="flex-1 min-w-0 flex flex-col">
        <AdminTopbar pendingConfirmations={pendingConfirmations} />
        {/* Fluid width with a ceiling at ~1700px so the admin data tables
            breathe on 1440p / 1920p monitors instead of hitting a narrow
            6xl cap, while still keeping line lengths readable on ultra-
            wide displays. `min-w-0` on <main> above lets this grow past
            its flex sibling's intrinsic width. */}
        {/* pb-24 di mobile = space untuk bottom-nav admin yang fixed
            (h-14 + safe-area). md:pt-6 + md:pb-6 reset karena di
            desktop pakai sidebar, bukan bottom-nav. */}
        <div className="flex-1 max-w-[1700px] w-full mx-auto px-4 pt-16 pb-24 md:px-6 md:pt-6 md:pb-6">
          {children}
        </div>
      </main>
    </div>
  );
}
