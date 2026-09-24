import { Wallet as WalletIcon, CakeSlice, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminHomeToday } from "@/lib/actions/admin-home.actions";
import type { YeoboRevenue } from "@/lib/actions/admin-home-yeobo.actions";

/**
 * AOV (Average Order Value = omzet ÷ jumlah transaksi) per BU/cabang di
 * Home admin — kloning visual `AdminRevenueCard` (tabel label | hari ini |
 * bulan ini) supaya konsisten dengan kartu Omzet di sampingnya, plus ▲▼
 * vs AOV rentang tanggal sama bulan lalu.
 *
 * "Bulan ini" = AOV kumulatif s.d. hari ini (omzet bulan ini ÷ jumlah
 * transaksi bulan ini). Delta-nya sendiri membandingkan s.d. KEMARIN
 * (hari ini dikeluarkan dari kedua sisi karena belum lengkap) — pola yang
 * sama dengan `monthDelta` di AdminRevenueCard.
 */

const formatRp = (n: number) =>
  "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));

/** null = tidak ada transaksi di periode itu (AOV tak terdefinisi). */
function aov(revenue: number, count: number): number | null {
  return count > 0 ? revenue / count : null;
}

interface MonthDelta {
  pct: number;
  title: string;
}

function monthDelta(
  curThroughYesterday: number | null,
  prev: number | null,
  prevLabel: string | null | undefined
): MonthDelta | null {
  if (curThroughYesterday == null || prev == null || !prevLabel || prev <= 0) return null;
  return {
    pct: ((curThroughYesterday - prev) / prev) * 100,
    title: `AOV ${prevLabel} bulan lalu (rentang tanggal yang sama, s.d. kemarin): ${formatRp(
      prev
    )} → ${formatRp(curThroughYesterday)}`,
  };
}

function DeltaPill({ d }: { d: MonthDelta }) {
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
      {up ? "▲" : "▼"} {txt}%
    </span>
  );
}

function AovRow({
  icon,
  label,
  day,
  month,
  delta,
}: {
  icon: React.ReactNode;
  label: string;
  day: number | null;
  month: number | null;
  delta?: MonthDelta | null;
}) {
  return (
    <>
      <span className="col-span-2 sm:col-span-1 mt-2.5 sm:mt-0 flex items-center gap-2 min-w-0 text-[13px] font-medium text-foreground">
        <span className="grid place-items-center size-[22px] rounded-md shrink-0 bg-accent text-[var(--teal-600)]">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="min-w-0 sm:text-right tabular-nums text-[13px] sm:text-sm font-medium text-foreground">
        <span className="block sm:hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Hari ini
        </span>
        <span className="whitespace-nowrap">{day != null ? formatRp(day) : "—"}</span>
      </span>
      <span className="min-w-0 sm:text-right tabular-nums text-[13px] sm:text-sm font-medium text-foreground">
        <span className="block sm:hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Bulan ini
        </span>
        <span className="whitespace-nowrap">{month != null ? formatRp(month) : "—"}</span>
        {delta && (
          <>
            <br className="sm:hidden" />
            <DeltaPill d={delta} />
          </>
        )}
      </span>
    </>
  );
}

function GroupHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-2 sm:col-span-3 mt-3 sm:mt-1 border-t border-border/60 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}

export function AdminAovCard({
  today,
  yeobo,
}: {
  today: AdminHomeToday;
  yeobo: YeoboRevenue | null;
}) {
  const cmp = today.monthCompare;

  return (
    <div
      className="bg-card rounded-2xl border border-border/70 overflow-hidden"
      style={{
        boxShadow: "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
      }}
    >
      <div className="px-4 sm:px-5 pt-4 pb-3">
        <div className="font-display font-semibold text-[15px] lg:text-base text-foreground tracking-[-0.015em]">
          AOV
        </div>
        <div className="text-[11.5px] text-muted-foreground mt-0.5">
          Rata-rata nilai transaksi · ▲▼ vs {cmp?.prevLabel ?? "rentang sama"} bulan lalu
        </div>
      </div>

      <div className="px-4 sm:px-5 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto] gap-x-4 sm:gap-x-5 gap-y-0.5 sm:gap-y-2.5 items-baseline">
          <span className="hidden sm:block" />
          <span className="hidden sm:block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-right">
            Hari ini
          </span>
          <span className="hidden sm:block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-right">
            Bulan ini
          </span>

          <AovRow
            icon={<WalletIcon size={13} />}
            label="POS Hbc Pare"
            day={aov(today.posHbcPareToday, today.posHbcPareTodayCount)}
            month={aov(today.posHbcPareMonth, today.posHbcPareMonthCount)}
            delta={monthDelta(
              aov(
                today.posHbcPareMonth - today.posHbcPareToday,
                today.posHbcPareMonthCount - today.posHbcPareTodayCount
              ),
              cmp?.posHbcPareCount ? aov(cmp.posHbcPare, cmp.posHbcPareCount) : null,
              cmp?.prevLabel
            )}
          />
          <AovRow
            icon={<WalletIcon size={13} />}
            label="POS Hbc Smg"
            day={aov(today.posHbcSmgToday, today.posHbcSmgTodayCount)}
            month={aov(today.posHbcSmgMonth, today.posHbcSmgMonthCount)}
            delta={monthDelta(
              aov(
                today.posHbcSmgMonth - today.posHbcSmgToday,
                today.posHbcSmgMonthCount - today.posHbcSmgTodayCount
              ),
              cmp?.posHbcSmgCount ? aov(cmp.posHbcSmg, cmp.posHbcSmgCount) : null,
              cmp?.prevLabel
            )}
          />
          <AovRow
            icon={<CakeSlice size={13} />}
            label="Cake Hbc Pare"
            day={aov(today.cakeHbcPareToday, today.cakeHbcPareTodayCount)}
            month={aov(today.cakeHbcPareMonth, today.cakeHbcPareMonthCount)}
            delta={monthDelta(
              aov(
                today.cakeHbcPareMonth - today.cakeHbcPareToday,
                today.cakeHbcPareMonthCount - today.cakeHbcPareTodayCount
              ),
              cmp?.cakeHbcPareCount ? aov(cmp.cakeHbcPare, cmp.cakeHbcPareCount) : null,
              cmp?.prevLabel
            )}
          />
          <AovRow
            icon={<CakeSlice size={13} />}
            label="Cake Hbc Smg"
            day={aov(today.cakeHbcSmgToday, today.cakeHbcSmgTodayCount)}
            month={aov(today.cakeHbcSmgMonth, today.cakeHbcSmgMonthCount)}
            delta={monthDelta(
              aov(
                today.cakeHbcSmgMonth - today.cakeHbcSmgToday,
                today.cakeHbcSmgMonthCount - today.cakeHbcSmgTodayCount
              ),
              cmp?.cakeHbcSmgCount ? aov(cmp.cakeHbcSmg, cmp.cakeHbcSmgCount) : null,
              cmp?.prevLabel
            )}
          />

          {yeobo && (
            <>
              <GroupHead>Yeobo Space</GroupHead>
              {yeobo.branches.map((b) => (
                <AovRow
                  key={b.id}
                  icon={<Camera size={13} />}
                  label={b.label}
                  day={aov(b.today, b.todayCount)}
                  month={aov(b.month, b.monthCount)}
                  delta={monthDelta(
                    aov(b.month - b.today, b.monthCount - b.todayCount),
                    b.prevSameRangeCount ? aov(b.prevSameRange ?? 0, b.prevSameRangeCount) : null,
                    yeobo.prevLabel
                  )}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
