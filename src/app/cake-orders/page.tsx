export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Cake, Archive, FileText } from "lucide-react";
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
import {
  CakePageHeader,
  CakeHeaderButton,
} from "@/components/cake/parts/CakePageHeader";

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
      <CakePageHeader
        backHref="/dashboard"
        icon={<Cake size={20} strokeWidth={2.25} />}
        eyebrow="Operasional · Cabang Pare + Semarang"
        title="Pesanan Cake"
        sub={`Order custom cake Haengbocake · ${orders.length} aktif minggu ini`}
        actions={
          <>
            <RefreshButton />
            <CakeHeaderButton
              href="/cake-orders/slip"
              icon={<FileText size={14} strokeWidth={2.25} />}
            >
              <span className="hidden sm:inline">Slip produksi</span>
              <span className="sm:hidden">Slip</span>
            </CakeHeaderButton>
            <CakeHeaderButton
              href="/cake-orders/archive"
              icon={<Archive size={14} strokeWidth={2.25} />}
            >
              <span className="hidden sm:inline">Arsip</span>
              <span className="sm:hidden">Arsip</span>
            </CakeHeaderButton>
            <NewOrderQuickButton
              optionsByKind={optionsByKind}
              diameters={diameters}
              prices={prices}
            />
          </>
        }
      />

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
