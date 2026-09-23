import { Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import type { YeoboUtilization } from "@/lib/actions/admin-home-yeobo.actions";

/**
 * Utilisasi slot Yeobo Space per cabang di Home admin. Superadmin-only
 * (lihat gate di `getYeoboSlotUtilization`). Kloning tata letak
 * `AdminRevenueCard` (tabel label | kolom | kolom) supaya konsisten
 * dengan kartu Omzet di sampingnya.
 */

const formatPct = (n: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

interface Delta {
  pct: number;
  title: string;
}

function delta(cur: number | null, prev: number | null, prevLabel: string | null): Delta | null {
  if (cur == null || prev == null || !prevLabel) return null;
  return {
    pct: cur - prev,
    title: `Dibanding ${prevLabel} (rentang tanggal sama, s.d. kemarin): ${formatPct(prev)}% → ${formatPct(cur)}%`,
  };
}

function DeltaPill({ d }: { d: Delta }) {
  const up = d.pct >= 0;
  const rounded = Math.abs(d.pct) < 0.05 ? 0 : d.pct;
  const txt = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "always",
  }).format(rounded);
  return (
    <span
      title={d.title}
      className={cn(
        "mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums sm:ml-1.5 sm:mt-0 sm:align-middle",
        up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
      )}
    >
      {up ? "▲" : "▼"} {txt} pts
    </span>
  );
}

function UtilRow({
  label,
  prevMonth,
  curMonth,
  d,
}: {
  label: string;
  prevMonth: number | null;
  curMonth: number | null;
  d: Delta | null;
}) {
  return (
    <>
      <span className="col-span-2 sm:col-span-1 mt-2.5 sm:mt-0 flex items-center gap-2 min-w-0 text-[13px] font-medium text-foreground">
        <span className="grid place-items-center size-[22px] rounded-md shrink-0 bg-accent text-[var(--teal-600)]">
          <Camera size={13} />
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="min-w-0 sm:text-right tabular-nums text-[13px] sm:text-sm font-medium text-foreground">
        <span className="block sm:hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Bulan lalu
        </span>
        <span className="whitespace-nowrap">{prevMonth != null ? `${formatPct(prevMonth)}%` : "—"}</span>
      </span>
      <span className="min-w-0 sm:text-right tabular-nums text-[13px] sm:text-sm font-medium text-foreground">
        <span className="block sm:hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Bulan ini
        </span>
        <span className="whitespace-nowrap">{curMonth != null ? `${formatPct(curMonth)}%` : "—"}</span>
        {d && (
          <>
            <br className="sm:hidden" />
            <DeltaPill d={d} />
          </>
        )}
      </span>
    </>
  );
}

export function AdminYeoboUtilizationCard({
  utilization,
}: {
  utilization: YeoboUtilization | null;
}) {
  if (!utilization) return null;
  const { branches } = utilization;
  if (!branches.some((b) => b.prevMonthPct != null || b.curMonthToDatePct != null)) return null;

  return (
    <div
      className="bg-card rounded-2xl border border-border/70 overflow-hidden"
      style={{
        boxShadow: "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
      }}
    >
      <div className="px-4 sm:px-5 pt-4 pb-3">
        <div className="font-display font-semibold text-[15px] lg:text-base text-foreground tracking-[-0.015em]">
          Utilisasi Slot Yeobo Space
        </div>
        <div className="text-[11.5px] text-muted-foreground mt-0.5">
          Booked ÷ (booked + slot aktif kosong)
          {utilization.prevSameRangeLabel
            ? ` · ▲▼ vs ${utilization.prevSameRangeLabel} bulan lalu`
            : ""}
        </div>
      </div>

      <div className="px-4 sm:px-5 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto] gap-x-4 sm:gap-x-5 gap-y-0.5 sm:gap-y-2.5 items-baseline">
          <span className="hidden sm:block" />
          <span className="hidden sm:block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-right">
            {utilization.prevMonthLabel}
          </span>
          <span className="hidden sm:block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-right">
            {utilization.curMonthLabel ?? "Bulan ini"}
          </span>

          {branches.map((b) => (
            <UtilRow
              key={b.id}
              label={b.label}
              prevMonth={b.prevMonthPct}
              curMonth={b.curMonthToDatePct}
              d={delta(b.curMonthToDatePct, b.prevSameRangePct, utilization.prevSameRangeLabel)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
