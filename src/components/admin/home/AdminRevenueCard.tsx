import Link from "next/link";
import { Wallet as WalletIcon, CakeSlice, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RevenueSummary } from "@/lib/actions/admin-home.actions";
import type { YeoboRevenue } from "@/lib/actions/admin-home-yeobo.actions";

/**
 * Kartu Omzet di Home admin: Haengbocake (POS + cake) dan Yeobo Space
 * per cabang, masing-masing hari ini & bulan ini dengan ▲▼ % vs bulan lalu
 * pada rentang tanggal yang sama (s.d. kemarin).
 *
 * LAYOUT: ≥sm tabel 3 kolom (label | hari ini | bulan ini). Di ponsel tiap
 * baris jadi blok — label di atas, dua angka berdampingan di bawahnya
 * dengan caption kecil — supaya "Rp 33.821.000 ▲13,9%" tidak terpotong.
 */

const formatRp = (n: number) =>
  "Rp " + new Intl.NumberFormat("id-ID").format(Math.round(n));

interface MonthDelta {
  pct: number;
  title: string;
}

/**
 * `curThroughYesterday` = total bulan ini dikurangi hari ini (hari ini belum
 * lengkap, jadi dikeluarkan dari kedua sisi). null bila tidak ada pembanding
 * atau bulan lalu 0 (persen tak terdefinisi).
 */
function monthDelta(
  curThroughYesterday: number,
  prev: number | null | undefined,
  prevLabel: string | null | undefined
): MonthDelta | null {
  if (prev == null || !prevLabel || prev <= 0) return null;
  return {
    pct: ((curThroughYesterday - prev) / prev) * 100,
    title: `Dibanding ${prevLabel} (rentang tanggal yang sama, s.d. kemarin): ${formatRp(
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

function RevenueRow({
  icon,
  label,
  day,
  month,
  delta,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  day: number;
  month: number;
  delta?: MonthDelta | null;
  /** Bila diisi, label jadi tautan (mis. ke layar POS cabang). */
  href?: string;
}) {
  return (
    <>
      <span className="col-span-2 sm:col-span-1 mt-2.5 sm:mt-0 flex items-center gap-2 min-w-0 text-[13px] font-medium text-foreground">
        <span className="grid place-items-center size-[22px] rounded-md shrink-0 bg-accent text-[var(--teal-600)]">
          {icon}
        </span>
        {href ? (
          <Link
            href={href}
            className="truncate underline-offset-2 hover:underline hover:text-primary"
          >
            {label}
          </Link>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </span>
      <span className="min-w-0 sm:text-right tabular-nums text-[13px] sm:text-sm font-medium text-foreground">
        <span className="block sm:hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Hari ini
        </span>
        <span className="whitespace-nowrap">{formatRp(day)}</span>
      </span>
      <span className="min-w-0 sm:text-right tabular-nums text-[13px] sm:text-sm font-medium text-foreground">
        <span className="block sm:hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Bulan ini
        </span>
        <span className="whitespace-nowrap">{formatRp(month)}</span>
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

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function AdminRevenueCard({
  today,
  yeobo,
}: {
  today: RevenueSummary;
  yeobo: YeoboRevenue | null;
}) {
  const cmp = today.monthCompare ?? null;
  return (
    <div
      className="bg-card rounded-2xl border border-border/70 overflow-hidden"
      style={{
        boxShadow:
          "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
      }}
    >
      <div className="px-4 sm:px-5 pt-4 pb-3">
        <div className="font-display font-semibold text-[15px] lg:text-base text-foreground tracking-[-0.015em]">
          Omzet
        </div>
        <div className="text-[11.5px] text-muted-foreground mt-0.5">
          {cmp
            ? `Hari ini & bulan ini · ▲▼ vs ${cmp.prevLabel} bulan lalu`
            : "Hari ini & akumulasi bulan ini"}
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

          <RevenueRow
            icon={<WalletIcon size={13} />}
            label="POS Hbc Pare"
            href="/pospare"
            day={today.posHbcPareToday}
            month={today.posHbcPareMonth}
            delta={monthDelta(
              today.posHbcPareMonth - today.posHbcPareToday,
              cmp?.posHbcPare,
              cmp?.prevLabel
            )}
          />
          <RevenueRow
            icon={<WalletIcon size={13} />}
            label="POS Hbc Smg"
            href="/possemarang"
            day={today.posHbcSmgToday}
            month={today.posHbcSmgMonth}
            delta={monthDelta(
              today.posHbcSmgMonth - today.posHbcSmgToday,
              cmp?.posHbcSmg,
              cmp?.prevLabel
            )}
          />
          <RevenueRow
            icon={<CakeSlice size={13} />}
            label="Cake Hbc Pare"
            day={today.cakeHbcPareToday}
            month={today.cakeHbcPareMonth}
            delta={monthDelta(
              today.cakeHbcPareMonth - today.cakeHbcPareToday,
              cmp?.cakeHbcPare,
              cmp?.prevLabel
            )}
          />
          <RevenueRow
            icon={<CakeSlice size={13} />}
            label="Cake Hbc Smg"
            day={today.cakeHbcSmgToday}
            month={today.cakeHbcSmgMonth}
            delta={monthDelta(
              today.cakeHbcSmgMonth - today.cakeHbcSmgToday,
              cmp?.cakeHbcSmg,
              cmp?.prevLabel
            )}
          />

          {yeobo && (
            <>
              <GroupHead>
                Yeobo Space · live dari yeobospace.id
                {yeobo.latestPaidAt && (
                  <span className="normal-case tracking-normal font-normal">
                    {" "}
                    (s.d. {timeLabel(yeobo.latestPaidAt)})
                  </span>
                )}
              </GroupHead>
              {yeobo.branches.map((b) => (
                <RevenueRow
                  key={b.id}
                  icon={<Camera size={13} />}
                  label={b.label}
                  day={b.today}
                  month={b.month}
                  delta={monthDelta(b.month - b.today, b.prevSameRange, yeobo.prevLabel)}
                />
              ))}
              <p className="col-span-2 sm:col-span-3 text-[10.5px] leading-snug text-muted-foreground mt-2 sm:mt-0">
                Net setelah fee Mayar 2,2% (booking + tambahan), jadi sebanding
                dengan angka bank/P&L. Tunai tidak kena fee.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
