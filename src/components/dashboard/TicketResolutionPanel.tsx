import { formatDuration, RECENT_RESOLUTION_TARGET_MS } from "@/lib/tickets/types";
import type { StudioHeadRecentResolutionKpi } from "@/lib/actions/tickets.actions";

/**
 * Kartu "Kecepatan Tiket Studio" di dashboard karyawan, khusus Kepala Studio.
 *
 * Beda dari `getStudioHeadKpi()` (rata-rata lifetime, dipakai di /tickets):
 * ini rata-rata N tiket resolved TERAKHIR saja, supaya lebih mencerminkan
 * performa terkini. Makin rendah makin baik, jadi tone() dibalik dari pola
 * ServiceLevelPanel — 2 tingkat (bukan 3) karena targetnya pass/fail thd SLA.
 */

function tone(ms: number | null): string {
  if (ms === null) return "text-muted-foreground";
  return ms <= RECENT_RESOLUTION_TARGET_MS ? "text-success" : "text-destructive";
}

export function TicketResolutionPanel({
  kpi,
}: {
  kpi: StudioHeadRecentResolutionKpi | null;
}) {
  if (!kpi) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Kecepatan Tiket Studio
        </h2>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>

      <div className="panel-sticker p-5 space-y-3">
        <p className="text-xs text-muted-foreground">
          Rata-rata waktu penyelesaian {kpi.sampleCount} tiket terakhir yang kamu
          tangani. Target ≤ 7 hari.
        </p>

        {kpi.sampleCount === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada tiket selesai.</p>
        ) : (
          <div className="flex items-baseline gap-3">
            <span
              className={`font-display text-4xl sm:text-5xl font-extrabold tabular-nums leading-none ${tone(
                kpi.avgResolutionMs
              )}`}
            >
              {formatDuration(kpi.avgResolutionMs!)}
            </span>
            <span className="text-xs text-muted-foreground">
              {kpi.sampleCount < 10 ? `dari ${kpi.sampleCount} tiket` : "10 tiket terakhir"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
