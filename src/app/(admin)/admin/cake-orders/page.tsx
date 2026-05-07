export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings, UsersRound, Cake } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listMyCakeOrders } from "@/lib/actions/cake-orders.actions";
import { listCakeOptions } from "@/lib/actions/cake-options.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { CakeOrdersBoard } from "@/components/cake/CakeOrdersBoard";

/**
 * Admin queue. Reuses the employee CakeOrdersList — admin gets the
 * same row layout, plus shortcut links to the dropdown options
 * editor and access management.
 */
export default async function AdminCakeOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [ordersRes, optsRes] = await Promise.all([
    listMyCakeOrders(),
    listCakeOptions(),
  ]);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Pesanan Cake"
        subtitle="Queue order custom cake yang masuk dari semua karyawan."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/cake-orders/options"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <Settings size={14} strokeWidth={2.5} />
              Opsi
            </Link>
            <Link
              href="/admin/cake-orders/access"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <UsersRound size={14} strokeWidth={2.5} />
              Akses
            </Link>
          </div>
        }
      />

      {/* Admin is view-only on cake orders. Disable drag-and-drop +
          per-card next-step buttons; the side-panel detail also won't
          show edit/payment/status controls (canMove → canEdit). */}
      <CakeOrdersBoard
        orders={ordersRes.ok ? ordersRes.data ?? [] : []}
        optionsByKind={optsRes.ok ? optsRes.data ?? null : null}
        canMove={false}
        showArchiveButton={false}
        isAdminView={true}
      />
    </div>
  );
}
