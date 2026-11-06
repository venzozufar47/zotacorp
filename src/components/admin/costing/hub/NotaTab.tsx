import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  PendingMaterialRow,
  PurchaseSummary,
  PurchaseView,
} from "@/lib/actions/procurement-purchases.actions";
import type { MaterialChangeView } from "@/lib/actions/procurement-materials.actions";
import type { CashPosition } from "@/lib/actions/procurement-wallet.actions";
import { PendingMaterials } from "@/components/procurement/PendingMaterials";
import { MaterialChangesFeed } from "@/components/procurement/MaterialChangesFeed";
import type { ShopeeWallet } from "@/lib/actions/procurement-shopee.actions";
import { CashOverview } from "./CashOverview";
import { PurchaseHistory, PurchaseSummaryCard } from "@/components/procurement/PurchaseHistory";
import { Disclosure } from "./Disclosure";

const navBtn =
  "grid size-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground";

/**
 * Tab Nota belanja. Urutan menurut kepentingan: yang perlu keputusan owner (bahan baru, perubahan
 * daftar bahan) di atas dan terbuka, posisi kas terlipat, lalu ringkasan bulan dan riwayat nota.
 */
export function NotaTab({
  pending,
  changes,
  positions,
  wallets,
  summary,
  purchases,
  today,
  monthLabel,
  prevHref,
  nextHref,
}: {
  pending: PendingMaterialRow[];
  changes: MaterialChangeView[];
  positions: CashPosition[];
  wallets: ShopeeWallet[];
  summary: PurchaseSummary | null;
  purchases: PurchaseView[];
  today: string;
  monthLabel: string;
  prevHref: string;
  nextHref: string | null;
}) {
  const unseen = changes.filter((c) => !c.ackedAt).length;
  const needsReview = pending.length + unseen;
  const negativeCash =
    positions.some((p) => p.procurementBalance !== null && p.procurementBalance < 0) ||
    wallets.some((w) => w.balance < 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={prevHref} aria-label="Bulan sebelumnya" className={navBtn}>
          <ChevronLeft size={16} />
        </Link>
        <span className="min-w-32 text-center text-sm font-semibold capitalize">{monthLabel}</span>
        {nextHref ? (
          <Link href={nextHref} aria-label="Bulan berikutnya" className={navBtn}>
            <ChevronRight size={16} />
          </Link>
        ) : (
          <span aria-hidden className="size-8" />
        )}
      </div>

      {needsReview > 0 ? (
        <Disclosure summary={`Perlu ditinjau (${needsReview})`} tone="attention" defaultOpen>
          <div className="space-y-5">
            <PendingMaterials rows={pending} />
            <MaterialChangesFeed rows={changes} />
          </div>
        </Disclosure>
      ) : (
        changes.length > 0 && (
          <Disclosure summary={`Perubahan daftar bahan (${changes.length})`} hint="semua sudah dilihat">
            <MaterialChangesFeed rows={changes} />
          </Disclosure>
        )
      )}

      {(positions.length > 0 || wallets.length > 0) && (
        <Disclosure
          summary="Posisi kas pengadaan"
          defaultOpen={negativeCash}
          hint={negativeCash ? <span className="font-semibold text-destructive">ada saldo negatif</span> : undefined}
        >
          <CashOverview positions={positions} wallets={wallets} />
        </Disclosure>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {summary && (
          <div className="lg:sticky lg:top-4 lg:self-start">
            <PurchaseSummaryCard summary={summary} title={`Pengeluaran ${monthLabel}`} />
          </div>
        )}
        <PurchaseHistory purchases={purchases} today={today} admin />
      </div>
    </div>
  );
}
