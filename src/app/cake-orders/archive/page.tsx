export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Archive } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import { listMyCakeOrders } from "@/lib/actions/cake-orders.actions";
import {
  listCakeOptions,
  listCakeDiameterOptions,
  listCakeBasePrices,
} from "@/lib/actions/cake-options.actions";
import { CakeOrdersBoard } from "@/components/cake/CakeOrdersBoard";
import { CakePageHeader } from "@/components/cake/parts/CakePageHeader";
import { StatCard } from "@/components/cake/parts/StatCard";
import { formatIDR } from "@/lib/cashflow/format";

/**
 * Dedicated archive page. Lists every cake order with `archived_at`
 * set, with the "Kembalikan" action exposed on each card. Live work
 * lives on `/cake-orders` — separating the two keeps the main lobby
 * uncluttered and gives admin a clear historical view.
 */
export default async function CakeOrdersArchivePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const access = await getMyCakeAccess();
  if (!access.hasOrders) {
    if (access.hasProduction) redirect("/cake-production");
    redirect("/dashboard");
  }

  const [ordersRes, optionsRes, diaRes, priceRes] = await Promise.all([
    listMyCakeOrders({ onlyArchived: true }),
    listCakeOptions(),
    listCakeDiameterOptions({ activeOnly: true }),
    listCakeBasePrices(),
  ]);
  const orders = ordersRes.ok ? ordersRes.data ?? [] : [];
  const optionsByKind = optionsRes.ok && optionsRes.data ? optionsRes.data : null;
  const diameters = diaRes.ok ? diaRes.data ?? [] : [];
  const prices = priceRes.ok ? priceRes.data ?? [] : [];

  // Stats for the summary row — split by branch + total monetary value.
  const pareCount = orders.filter((o) => o.branch === "pare").length;
  const semCount = orders.filter((o) => o.branch === "semarang").length;
  const totalValue = orders.reduce((s, o) => s + (o.total_idr ?? 0), 0);

  return (
    <div className="space-y-4">
      <CakePageHeader
        backHref="/cake-orders"
        icon={<Archive size={20} strokeWidth={2.25} />}
        iconStyle={{
          background: "linear-gradient(140deg, #E2E8F0 0%, #CBD5E1 100%)",
          borderColor: "#94A3B8",
          color: "#334155",
        }}
        eyebrow="Arsip · Riwayat order tutup buku"
        title="Arsip Pesanan"
        sub={
          <>
            Semua order yang sudah diarsipkan. Tekan{" "}
            <strong>Kembalikan</strong> untuk mengembalikan ke daftar utama.
          </>
        }
      />

      {orders.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total diarsipkan"
            value={String(orders.length)}
            accent="#94A3B8"
          />
          <StatCard
            label="Pare"
            value={String(pareCount)}
            accent="var(--cake-pare-fg)"
          />
          <StatCard
            label="Semarang"
            value={String(semCount)}
            accent="var(--cake-sem-fg)"
          />
          <StatCard
            label="Nilai total"
            value={`Rp ${formatIDR(totalValue)}`}
            accent="var(--cake-primary)"
            mono
          />
        </div>
      )}

      {orders.length === 0 ? (
        <div
          className="rounded-2xl border-2 border-dashed px-6 py-12 text-center"
          style={{
            background: "var(--cake-bg-elev)",
            borderColor: "var(--cake-border)",
          }}
        >
          <div className="text-4xl mb-2">🗄️</div>
          <p
            className="text-sm"
            style={{ color: "var(--cake-fg-soft)" }}
          >
            Belum ada pesanan yang diarsipkan.
          </p>
        </div>
      ) : (
        <CakeOrdersBoard
          orders={orders}
          optionsByKind={optionsByKind}
          diameters={diameters}
          prices={prices}
          canMove={false}
          showArchiveButton={false}
          showUnarchiveButton
          flatLayout
          enableSearch
        />
      )}
    </div>
  );
}
