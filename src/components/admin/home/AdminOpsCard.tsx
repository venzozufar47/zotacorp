import Link from "next/link";
import type { AdminOpsMetrics } from "@/lib/actions/admin-home.actions";
import type { YeoboUtilization } from "@/lib/actions/admin-home-yeobo.actions";
import { serviceLevelTone } from "@/lib/pos/service-level";
import { wasteTone, WASTE_EXPIRED_TARGET } from "@/lib/pos/waste";
import { formatDuration, RECENT_RESOLUTION_TARGET_MS } from "@/lib/tickets/types";
import { cn } from "@/lib/utils";

/**
 * Kartu operasional di Home admin: Service Level & "ditarik expired" per
 * outlet POS (30 hari), utilisasi slot Yeobo Space, + KPI kecepatan tiket
 * Kepala Studio. Angka dan warnanya memakai fungsi yang sama dengan halaman
 * Service Level dan dashboard Kepala Studio, jadi tidak pernah berbeda
 * antar layar.
 */

const TONE_CLASS = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
} as const;

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

const formatUtilPct = (n: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

function UtilDeltaPill({ cur, prev }: { cur: number; prev: number }) {
  const diff = cur - prev;
  if (Math.abs(diff) < 0.05) return null;
  const up = diff > 0;
  return (
    <span
      title={`Rentang tanggal sama bulan lalu: ${formatUtilPct(prev)}%`}
      className={cn(
        "block sm:inline sm:ml-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums",
        up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
      )}
    >
      {up ? "▲" : "▼"} {formatUtilPct(Math.abs(diff))} pts
    </span>
  );
}

function UtilRow({
  label,
  prevMonth,
  curMonth,
  prevSameRange,
}: {
  label: string;
  prevMonth: number | null;
  curMonth: number | null;
  /** Bulan lalu pada rentang tanggal SAMA s.d. kemarin — basis delta yang
   *  adil buat curMonth (bulan-ini-parsial), BEDA dari prevMonth (bulan
   *  lalu penuh, cuma ditampilkan sebagai angka, bukan dasar delta). */
  prevSameRange: number | null;
}) {
  return (
    <>
      <span className="text-[13px] font-medium text-foreground break-words">{label}</span>
      <span className="text-right whitespace-nowrap tabular-nums text-[13px] font-medium text-foreground">
        {prevMonth != null ? `${formatUtilPct(prevMonth)}%` : "—"}
      </span>
      <span className="text-right whitespace-nowrap">
        <span className="font-display text-lg font-extrabold tabular-nums text-foreground">
          {curMonth != null ? `${formatUtilPct(curMonth)}%` : "—"}
        </span>
        {curMonth != null && prevSameRange != null && (
          <UtilDeltaPill cur={curMonth} prev={prevSameRange} />
        )}
      </span>
    </>
  );
}

export function AdminOpsCard({
  ops,
  yeoboUtilization,
}: {
  ops?: AdminOpsMetrics | null;
  yeoboUtilization?: YeoboUtilization | null;
}) {
  // Defensif: data operasional itu pelengkap Home — kalau kosong (mis. skew
  // antar bundle saat deploy), kartu tampil kosong, bukan menjatuhkan Beranda.
  const outlets = ops?.outlets ?? [];
  const kpi = ops?.ticketKpi ?? null;
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
        boxShadow:
          "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
      }}
    >
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-display font-semibold text-[15px] lg:text-base text-foreground tracking-[-0.015em]">
            Operasional
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">
            30 hari terakhir
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-5 pb-4">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 sm:gap-x-5 gap-y-2.5 items-center">
          <span />
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-right">
            Service level
          </span>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-right">
            Ditarik expired
          </span>
          {outlets.map((o) => (
            <OutletRow key={o.id} o={o} />
          ))}
          {outlets.length === 0 && (
            <span className="col-span-3 text-[13px] text-muted-foreground">
              Belum ada outlet dengan metrik aktif.
            </span>
          )}
        </div>

        {yeoboUtilization && yeoboUtilization.branches.some((b) => b.prevMonthPct != null || b.curMonthToDatePct != null) && (
          <div className="mt-3 pt-3 border-t border-border/60">
            <div className="text-[13px] font-medium text-foreground">Utilisasi Slot Yeobo Space</div>
            <div className="text-[11px] text-muted-foreground mb-2">
              Booked ÷ (booked + slot aktif kosong)
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 sm:gap-x-5 gap-y-2 items-baseline">
              <span />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-right">
                {yeoboUtilization.prevMonthLabel}
              </span>
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-right">
                {yeoboUtilization.curMonthLabel ?? "Bulan ini"}
              </span>
              {yeoboUtilization.branches.map((b) => (
                <UtilRow
                  key={b.id}
                  label={b.label}
                  prevMonth={b.prevMonthPct}
                  curMonth={b.curMonthToDatePct}
                  prevSameRange={b.prevSameRangePct}
                />
              ))}
            </div>
          </div>
        )}

        {kpi && (
          <div className="mt-3 pt-3 border-t border-border/60 flex items-baseline justify-between gap-3">
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
      </div>
    </div>
  );
}

function OutletRow({ o }: { o: AdminOpsMetrics["outlets"][number] }) {
  const sl = TONE_CLASS[serviceLevelTone(o.serviceLevel, o.serviceLevelTarget)];
  const ex = TONE_CLASS[wasteTone(o.expiredRate)];
  return (
    <>
      <Link
        href={o.href}
        className="text-[13px] font-medium text-foreground break-words underline-offset-2 hover:underline hover:text-primary"
      >
        {o.label}
      </Link>
      <span className="text-right whitespace-nowrap">
        <span className={`font-display text-lg font-extrabold tabular-nums ${sl}`}>
          {pct(o.serviceLevel)}
        </span>
        <span className="block sm:inline sm:ml-1.5 text-[10.5px] leading-none text-muted-foreground">
          /{(o.serviceLevelTarget * 100).toFixed(0)}%
        </span>
      </span>
      <span className="text-right whitespace-nowrap">
        <span className={`font-display text-lg font-extrabold tabular-nums ${ex}`}>
          {pct(o.expiredRate)}
        </span>
        <span className="block sm:inline sm:ml-1.5 text-[10.5px] leading-none text-muted-foreground">
          &lt;{(WASTE_EXPIRED_TARGET * 100).toFixed(0)}%
        </span>
      </span>
    </>
  );
}
