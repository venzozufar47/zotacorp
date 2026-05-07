export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Cake, ArrowLeft, Archive, FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import { listMyCakeOrders } from "@/lib/actions/cake-orders.actions";
import { listCakeOptions } from "@/lib/actions/cake-options.actions";
import { CakeOrdersBoard } from "@/components/cake/CakeOrdersBoard";
import { NewOrderQuickButton } from "@/components/cake/NewOrderQuickButton";

/**
 * Employee lobby for custom cake orders. Shows the staff member's
 * recent orders plus a "Pesanan baru" CTA. Gated to users with the
 * 'orders' scope (admin implicitly passes — we use access.hasOrders
 * here because role is checked separately by the action layer).
 */
export default async function CakeOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ archived?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const access = await getMyCakeAccess();
  if (!access.hasOrders) {
    // Production-only users land here by accident → bounce them to
    // their slips list. Everyone else gets the dashboard.
    if (access.hasProduction) redirect("/cake-production");
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const includeArchived = params.archived === "1";
  const [ordersRes, optionsRes] = await Promise.all([
    listMyCakeOrders({ includeArchived }),
    listCakeOptions(),
  ]);
  const orders = ordersRes.ok ? ordersRes.data ?? [] : [];
  const optionsByKind = optionsRes.ok && optionsRes.data ? optionsRes.data : null;

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href="/dashboard"
            className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
            aria-label="Kembali ke dashboard"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
          </Link>
          <span className="flex items-center justify-center size-9 rounded-full bg-pop-pink text-foreground border-2 border-foreground shrink-0">
            <Cake size={16} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
              Pesanan Cake
            </h1>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Order custom cake Haengbocake.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/cake-orders/slip"
            className="flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <FileText size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Slip produksi</span>
            <span className="sm:hidden">Slip</span>
          </Link>
          <Link
            href={
              includeArchived ? "/cake-orders" : "/cake-orders?archived=1"
            }
            className={`flex items-center gap-1.5 rounded-xl border-2 border-foreground px-3 py-2 text-sm font-medium hover:bg-muted ${
              includeArchived ? "bg-foreground text-background" : "bg-card"
            }`}
            aria-pressed={includeArchived}
          >
            <Archive size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">
              {includeArchived ? "Sembunyikan arsip" : "Arsip"}
            </span>
          </Link>
          <NewOrderQuickButton optionsByKind={optionsByKind} />
        </div>
      </header>

      <CakeOrdersBoard
        orders={orders}
        optionsByKind={optionsByKind}
        showArchiveButton={!includeArchived}
        showUnarchiveButton={includeArchived}
      />
    </div>
  );
}
