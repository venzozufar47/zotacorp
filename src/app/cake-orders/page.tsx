export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Cake, ArrowLeft, Archive, FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import { listMyCakeOrders } from "@/lib/actions/cake-orders.actions";
import {
  listCakeOptions,
  listCakeDiameterOptions,
  listCakeBasePrices,
} from "@/lib/actions/cake-options.actions";
import { CakeOrdersBoard } from "@/components/cake/CakeOrdersBoard";
import { NewOrderQuickButton } from "@/components/cake/NewOrderQuickButton";
import { RefreshButton } from "@/components/shared/RefreshButton";

/**
 * Employee lobby for custom cake orders. Shows the staff member's
 * recent orders plus a "Pesanan baru" CTA. The archive lives on its
 * own page (`/cake-orders/archive`) so this view stays focused on
 * live work.
 */
export default async function CakeOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const access = await getMyCakeAccess();
  if (!access.hasOrders) {
    // Production-only users land here by accident → bounce them to
    // their slips list. Everyone else gets the dashboard.
    if (access.hasProduction) redirect("/cake-production");
    redirect("/dashboard");
  }

  const [ordersRes, optionsRes, diaRes, priceRes] = await Promise.all([
    listMyCakeOrders(),
    listCakeOptions(),
    listCakeDiameterOptions({ activeOnly: true }),
    listCakeBasePrices(),
  ]);
  const orders = ordersRes.ok ? ordersRes.data ?? [] : [];
  const optionsByKind = optionsRes.ok && optionsRes.data ? optionsRes.data : null;
  const diameters = diaRes.ok ? diaRes.data ?? [] : [];
  const prices = priceRes.ok ? priceRes.data ?? [] : [];

  return (
    <div className="space-y-3">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/dashboard"
            className="rounded-full p-1.5 hover:bg-muted text-muted-foreground shrink-0"
            aria-label="Kembali ke dashboard"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
          </Link>
          <span className="flex items-center justify-center size-9 rounded-full bg-pop-pink text-foreground border-2 border-foreground shrink-0">
            <Cake size={16} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-foreground leading-tight truncate">
              Pesanan Cake
            </h1>
            <p className="text-[11px] text-muted-foreground leading-snug truncate">
              Order custom cake Haengbocake.
            </p>
          </div>
        </div>
        {/* Action row di-stack di bawah title pada mobile supaya title +
            subtitle tidak ter-clipped oleh kelompok tombol yang ramai
            (Refresh + Slip + Arsip + Baru). flex-wrap sebagai safety
            kalau label sub-tombol membesar. */}
        <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
          <RefreshButton />
          <Link
            href="/cake-orders/slip"
            className="flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <FileText size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Slip produksi</span>
            <span className="sm:hidden">Slip</span>
          </Link>
          <Link
            href="/cake-orders/archive"
            className="flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            aria-label="Arsip"
          >
            <Archive size={14} strokeWidth={2.5} />
            <span className="hidden sm:inline">Arsip</span>
          </Link>
          <NewOrderQuickButton
            optionsByKind={optionsByKind}
            diameters={diameters}
            prices={prices}
          />
        </div>
      </header>

      <CakeOrdersBoard
        orders={orders}
        optionsByKind={optionsByKind}
        diameters={diameters}
        prices={prices}
        enableSearch
      />
    </div>
  );
}
