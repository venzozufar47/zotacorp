export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings, UsersRound } from "lucide-react";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { listMyCakeOrders } from "@/lib/actions/cake-orders.actions";
import {
  listCakeOptions,
  listCakeDiameterOptions,
  listCakeBasePrices,
} from "@/lib/actions/cake-options.actions";
import { getCakeFinanceRecapMonth } from "@/lib/actions/cake-finance.actions";
import {
  listMySlips,
  getSlipForProduction,
} from "@/lib/actions/cake-slips.actions";
import { formatMonthYear } from "@/lib/payslip/formatters";
import { PageHeader } from "@/components/shared/PageHeader";
import { RefreshButton } from "@/components/shared/RefreshButton";
import { CakeOrdersBoard } from "@/components/cake/CakeOrdersBoard";
import {
  CakeOrdersTabsNav,
  type CakeOrdersTab,
} from "@/components/cake/CakeOrdersTabsNav";
import { CakeFinanceView } from "@/components/cake/CakeFinanceView";
import { ProductionLobby } from "@/components/cake/ProductionLobby";

interface SearchParams {
  tab?: string;
  month?: string;
  year?: string;
  /** Selected slip id — only meaningful on the "production" tab. */
  slip?: string;
}

/**
 * Admin queue. Reuses the employee CakeOrdersList — admin gets the
 * same row layout, plus shortcut links to the dropdown options
 * editor and access management. A second tab ("Finance") shows the
 * payment recap, recognized by cake pickup date.
 */
export default async function AdminCakeOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const tab: CakeOrdersTab =
    sp.tab === "finance"
      ? "finance"
      : sp.tab === "archive"
        ? "archive"
        : sp.tab === "production"
          ? "production"
          : "orders";
  const today = new Date();
  const month = parseInt(sp.month ?? String(today.getMonth() + 1), 10);
  const year = parseInt(sp.year ?? String(today.getFullYear()), 10);

  const header = (
    <PageHeader
      title="Pesanan Cake"
      subtitle="Queue order custom cake yang masuk dari semua karyawan."
      action={
        <div className="flex flex-wrap gap-2">
          <RefreshButton />
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
  );

  // Produksi tab — kanban produksi + slip checklist yang sama dengan
  // /cake-production (dipakai tim "orders"-scope Haengbocake), reused
  // di sini persis apa adanya untuk superadmin. Read-only: superadmin
  // melihat status yang sama, tapi mengubahnya tetap employee-only
  // (product decision yang sama dengan tab Order di atas — canMove
  // {false}). listMySlips/getSlipForProduction sudah menerima role
  // admin (lihat komentar di cake-slips.actions.ts).
  if (tab === "production") {
    const selectedSlipId = sp.slip ?? null;
    const [slipsRes, detailRes] = await Promise.all([
      listMySlips(),
      selectedSlipId
        ? getSlipForProduction(selectedSlipId)
        : Promise.resolve(null),
    ]);
    const slips = slipsRes.ok ? slipsRes.data ?? [] : [];
    return (
      <div className="space-y-5 animate-fade-up">
        {header}
        <CakeOrdersTabsNav current="production" />
        <ProductionLobby
          slips={slips}
          isAdmin
          readOnly
          showHeader={false}
          selectedSlipId={selectedSlipId}
          slipHrefBase="/admin/cake-orders?tab=production"
          detail={
            detailRes && detailRes.ok && detailRes.data
              ? {
                  slip: detailRes.data.slip,
                  items: detailRes.data.items,
                  myProductionRole: detailRes.data.myProductionRole,
                }
              : null
          }
          detailError={detailRes && !detailRes.ok ? detailRes.error : null}
        />
      </div>
    );
  }

  // Finance tab — recap keyed by pickup month. Skip the board data
  // fetches entirely.
  if (tab === "finance") {
    const recap = await getCakeFinanceRecapMonth(month, year);
    return (
      <div className="space-y-5 animate-fade-up">
        {header}
        <CakeOrdersTabsNav current="finance" />
        <CakeFinanceView
          month={month}
          year={year}
          monthLabel={formatMonthYear(year, month)}
          recap={recap}
        />
      </div>
    );
  }

  // Orders tab (default) + Archive tab share the same board component;
  // the archive variant fetches ONLY archived rows and renders a flat
  // grid (no kanban columns — every archived order is "done").
  const isArchive = tab === "archive";
  const [ordersRes, optsRes, diaRes, priceRes] = await Promise.all([
    listMyCakeOrders(isArchive ? { onlyArchived: true } : undefined),
    listCakeOptions(),
    listCakeDiameterOptions({ activeOnly: true }),
    listCakeBasePrices(),
  ]);

  return (
    <div className="space-y-5 animate-fade-up">
      {header}
      <CakeOrdersTabsNav current={isArchive ? "archive" : "orders"} />

      {/* Admin is view-only on cake orders. Disable drag-and-drop +
          per-card next-step buttons; the side-panel detail also won't
          show edit/payment/status controls (canMove → canEdit).
          Search is enabled on both the live board and the archive so
          admin can find an order by name / phone / greeting card. */}
      <CakeOrdersBoard
        orders={ordersRes.ok ? ordersRes.data ?? [] : []}
        optionsByKind={optsRes.ok ? optsRes.data ?? null : null}
        diameters={diaRes.ok ? diaRes.data ?? [] : []}
        prices={priceRes.ok ? priceRes.data ?? [] : []}
        canMove={false}
        showArchiveButton={false}
        enableSearch
        flatLayout={isArchive}
        isAdminView={true}
      />
    </div>
  );
}
