export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { getMyCakeAccess } from "@/lib/cake-orders/access";
import { listMyCakeOrders } from "@/lib/actions/cake-orders.actions";
import { listCakeOptions } from "@/lib/actions/cake-options.actions";
import { CakeOrdersBoard } from "@/components/cake/CakeOrdersBoard";

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

  const [ordersRes, optionsRes] = await Promise.all([
    listMyCakeOrders({ onlyArchived: true }),
    listCakeOptions(),
  ]);
  const orders = ordersRes.ok ? ordersRes.data ?? [] : [];
  const optionsByKind = optionsRes.ok && optionsRes.data ? optionsRes.data : null;

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href="/cake-orders"
            className="rounded-full p-1.5 hover:bg-muted text-muted-foreground"
            aria-label="Kembali ke pesanan cake"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
          </Link>
          <span className="flex items-center justify-center size-9 rounded-full bg-muted text-foreground border-2 border-foreground shrink-0">
            <Archive size={16} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
              Arsip Pesanan
            </h1>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Semua order yang sudah diarsipkan. Tekan{" "}
              <span className="font-medium">Kembalikan</span> untuk
              mengembalikan ke daftar utama.
            </p>
          </div>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Belum ada pesanan yang diarsipkan.
          </p>
        </div>
      ) : (
        <CakeOrdersBoard
          orders={orders}
          optionsByKind={optionsByKind}
          showArchiveButton={false}
          showUnarchiveButton
        />
      )}
    </div>
  );
}
