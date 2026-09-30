import Link from "next/link";
import { Camera } from "lucide-react";
import type { StudioHeadRecentResolutionKpi } from "@/lib/actions/tickets.actions";
import { formatDuration, RECENT_RESOLUTION_TARGET_MS } from "@/lib/tickets/types";

/**
 * Sisa dari kartu "Operasional" lama yang TIDAK per-cabang — kecepatan
 * tiket Kepala Studio (rata-rata seluruh studio, bukan satu cabang) dan
 * quick-access review foto kebersihan (lintas cabang). Keduanya tidak
 * punya tempat di grid per-cabang (`BranchCardsGrid`), jadi tetap satu
 * kartu kecil terpisah alih-alih dipaksakan ke salah satu kartu cabang.
 */

const TONE_CLASS = {
  success: "text-success",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
} as const;

export function StudioOpsSummary({
  ticketKpi,
  cleaningReviewQuickAccess,
  footer,
}: {
  ticketKpi?: StudioHeadRecentResolutionKpi | null;
  cleaningReviewQuickAccess?: { freshUnreviewedCount: number } | null;
  /** Slot baris kecil di bawah, dipisah garis — dipakai
   *  RevenueDashboardViewersManager (collapsed, cuma satu link teks) yang
   *  tidak berhak jadi kartu sendiri kalau lagi tertutup. */
  footer?: React.ReactNode;
}) {
  const kpi = ticketKpi ?? null;
  const ticketTone =
    !kpi || kpi.avgResolutionMs === null
      ? "muted"
      : kpi.avgResolutionMs <= RECENT_RESOLUTION_TARGET_MS
        ? "success"
        : "destructive";

  return (
    <div
      className="bg-card rounded-2xl border border-border/70 overflow-hidden"
      style={{
        boxShadow: "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
      }}
    >
      <div className="px-4 sm:px-5 pt-4 pb-1">
        {kpi && (
          <div className="pb-3 flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <Link
                href="/admin/tickets"
                className="text-[13px] font-medium text-foreground underline-offset-2 hover:underline hover:text-primary"
              >
                Kecepatan tiket Kepala Studio
              </Link>
              <span className="block text-[11px] text-muted-foreground">
                {kpi.sampleCount === 0
                  ? "Belum ada tiket selesai"
                  : `rata-rata ${kpi.sampleCount} tiket terakhir · target ≤ 7 hari`}
              </span>
            </div>
            <span
              className={`font-display text-lg font-extrabold tabular-nums whitespace-nowrap ${TONE_CLASS[ticketTone]}`}
            >
              {kpi.avgResolutionMs === null ? "—" : formatDuration(kpi.avgResolutionMs)}
            </span>
          </div>
        )}

        <div
          className={`pb-4 flex items-baseline justify-between gap-3 ${
            kpi ? "pt-3 border-t border-border/60" : ""
          }`}
        >
          <div className="min-w-0">
            <Link
              href="/admin/cleaning?gallery=1"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground underline-offset-2 hover:underline hover:text-primary"
            >
              <Camera size={13} className="shrink-0" />
              Review foto kebersihan
            </Link>
            <span className="block text-[11px] text-muted-foreground">
              Tinjau satu per satu, tandai Acc atau perlu ulang
            </span>
          </div>
          {!!cleaningReviewQuickAccess?.freshUnreviewedCount && (
            <span className="font-display text-lg font-extrabold tabular-nums whitespace-nowrap text-foreground">
              {cleaningReviewQuickAccess.freshUnreviewedCount}
            </span>
          )}
        </div>

        {footer && <div className="pb-4 pt-3 border-t border-border/60">{footer}</div>}
      </div>
    </div>
  );
}
