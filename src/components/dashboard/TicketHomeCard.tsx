import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight, CircleCheck, Ticket as TicketIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, RECENT_RESOLUTION_TARGET_MS } from "@/lib/tickets/types";
import type { BranchTicketOverview, StudioHeadRecentResolutionKpi } from "@/lib/actions/tickets.actions";

/**
 * Satu kartu "Tiket" di beranda karyawan, tiga lapis menurut urgensi:
 *  1. Perlu tindakanmu — hanya bila ada tugas (ditugaskan, menunggu ditangani atasan, menunggu konfirmasi). Paling
 *     menonjol; merah bila ada yang mendesak.
 *  2. Tiket aktif di cabang — untuk semua karyawan, hanya info: jumlah, bar status, dua judul terbaru. Tiket selesai
 *     atau dibatalkan dianggap tidak aktif dan tidak dihitung.
 *  3. Rata-rata selesai — khusus atasan: rata-rata N tiket terakhir terhadap target.
 * Detail per tiket ada di halaman Tiket; kartu ini sengaja ringkas.
 */

export interface TicketActionSummary {
  assigned: number;
  /** Menunggu ditangani saya sebagai atasan / pemegang tingkat. */
  studioQueue: number;
  awaitingConfirmation: number;
  urgent: boolean;
}

const STATUS_BAR = [
  { key: "open", label: "baru", color: "var(--warning)" },
  { key: "in_progress", label: "dikerjakan", color: "var(--primary)" },
  { key: "escalated", label: "tunggu atasan", color: "var(--pop-pink)" },
  { key: "owner_handling", label: "ditangani", color: "var(--foreground)" },
] as const;

export function TicketHomeCard({
  action,
  overview,
  kpi,
}: {
  action: TicketActionSummary;
  overview: BranchTicketOverview | null;
  /** Null = bukan atasan (baris rata-rata tidak tampil). */
  kpi: StudioHeadRecentResolutionKpi | null;
}) {
  const needsAction = action.assigned > 0 || action.studioQueue > 0 || action.awaitingConfirmation > 0;
  if (!needsAction && !overview && !kpi) return null;

  return (
    <section aria-label="Tiket" className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      {needsAction && (
        <Link
          href="/tickets"
          className={cn(
            "group block border-b border-border/70 px-3.5 py-3 transition active:opacity-90",
            action.urgent ? "bg-destructive/15" : "bg-warning/25"
          )}
        >
          <span className="flex items-center gap-2 font-display text-sm font-bold">
            <AlertTriangle size={17} aria-hidden className={action.urgent ? "text-destructive" : undefined} />
            Perlu tindakanmu
            <span
              aria-hidden
              className="ml-auto grid size-7 place-items-center rounded-full bg-foreground text-background transition group-hover:translate-x-0.5"
            >
              <ArrowRight size={15} />
            </span>
          </span>
          <span className="mt-2 flex flex-wrap gap-1.5">
            {action.assigned > 0 && <ActionChip n={action.assigned} text="ditugaskan untukmu" strong />}
            {action.studioQueue > 0 && <ActionChip n={action.studioQueue} text="menunggu ditangani" strong />}
            {action.awaitingConfirmation > 0 && <ActionChip n={action.awaitingConfirmation} text="tunggu konfirmasimu" />}
          </span>
        </Link>
      )}

      {overview && (
        <Link href="/tickets" className="block px-3.5 py-3 transition active:bg-muted/40">
          {overview.total === 0 ? (
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <CircleCheck size={16} aria-hidden />
              Tidak ada tiket aktif di {overview.label}
              <ChevronRight size={15} aria-hidden className="ml-auto" />
            </span>
          ) : (
            <>
              <span className="flex items-center gap-2 text-[13px] text-foreground">
                <TicketIcon size={16} aria-hidden />
                <span className="font-display font-bold">
                  {overview.total} tiket aktif di {overview.label}
                </span>
                <ChevronRight size={15} aria-hidden className="ml-auto text-muted-foreground" />
              </span>
              <span className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {STATUS_BAR.map((s) =>
                  overview.counts[s.key] > 0 ? (
                    <span key={s.key} style={{ width: `${(overview.counts[s.key] / overview.total) * 100}%`, background: s.color }} />
                  ) : null
                )}
              </span>
              <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
                {STATUS_BAR.map((s) =>
                  overview.counts[s.key] > 0 ? (
                    <span key={s.key} className="inline-flex items-center gap-1">
                      <span className="size-1.5 rounded-full" style={{ background: s.color }} aria-hidden />
                      {overview.counts[s.key]} {s.label}
                    </span>
                  ) : null
                )}
              </span>
              {!action.assigned && !action.studioQueue && overview.latest.length > 0 && (
                <span className="mt-2 block space-y-0.5 border-t border-border/60 pt-1.5 text-[12.5px] text-muted-foreground">
                  {overview.latest.map((t) => (
                    <span key={t.id} className="flex items-center gap-1.5">
                      {t.urgent && <span className="size-2 shrink-0 rounded-full bg-destructive" title="Mendesak" />}
                      <span className="truncate">{t.title}</span>
                    </span>
                  ))}
                </span>
              )}
            </>
          )}
        </Link>
      )}

      {kpi && <AvgRow kpi={kpi} bordered={needsAction || !!overview} />}
    </section>
  );
}

function ActionChip({ n, text, strong }: { n: number; text: string; strong?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border-[1.5px] px-2.5 py-0.5 text-xs",
        strong ? "border-foreground bg-foreground text-background" : "border-foreground bg-card text-foreground"
      )}
    >
      <b className="font-bold tabular-nums">{n}</b> {text}
    </span>
  );
}

function AvgRow({ kpi, bordered }: { kpi: StudioHeadRecentResolutionKpi; bordered: boolean }) {
  const has = kpi.sampleCount > 0 && kpi.avgResolutionMs !== null;
  const ok = has && kpi.avgResolutionMs! <= RECENT_RESOLUTION_TARGET_MS;
  const pct = has ? Math.min(100, (kpi.avgResolutionMs! / RECENT_RESOLUTION_TARGET_MS) * 100) : 0;
  return (
    <div className={cn("flex items-center gap-2.5 bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground", bordered && "border-t border-border/60")}>
      {has ? (
        <>
          <span className="shrink-0">Rata-rata selesai</span>
          <b className={cn("shrink-0 font-display text-[15px] tabular-nums", ok ? "text-success" : "text-destructive")}>
            {formatDuration(kpi.avgResolutionMs!)}
          </b>
          <span className="relative h-1.5 flex-1 rounded-full bg-border" aria-hidden>
            <span className={cn("absolute inset-y-0 left-0 rounded-full", ok ? "bg-success" : "bg-destructive")} style={{ width: `${pct}%` }} />
          </span>
          <span className="shrink-0" title={`Rata-rata ${kpi.sampleCount} tiket terakhir`}>
            target 7 hari
          </span>
        </>
      ) : (
        <span>Rata-rata selesai: belum ada tiket selesai</span>
      )}
    </div>
  );
}
