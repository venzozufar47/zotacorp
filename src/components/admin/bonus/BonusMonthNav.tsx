import Link from "next/link";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthShort, monthsOfQuarter, quarterLabel, quarterOf, shiftQuarter } from "@/lib/bonus/periods";

const href = (period: string) => `/admin/bonus?bulan=${period}`;

/**
 * Navigasi kuartal + bulan: panah kuartal, tiga tombol bulan, dan pintasan "Bulan ini". Bulan yang belum tiba
 * dinonaktifkan; bulan yang bonusnya sudah terbit bertanda centang. Server component murni (hanya tautan).
 */
export function BonusMonthNav({ period, thisMonth, published }: { period: string; thisMonth: string; published: string[] }) {
  const quarter = quarterOf(period);
  const months = monthsOfQuarter(quarter);
  const prev = shiftQuarter(quarter, -1);
  const next = shiftQuarter(quarter, 1);
  const prevTarget = monthsOfQuarter(prev)[2];
  const nextTarget = monthsOfQuarter(next)[0];
  const canNext = nextTarget <= thisMonth;
  const arrow = "grid size-10 place-items-center rounded-full border-2 transition";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href(prevTarget)} scroll={false} aria-label="Kuartal sebelumnya" className={cn(arrow, "border-border bg-card hover:border-foreground/50")}>
          <ChevronLeft size={18} />
        </Link>
        <span className="min-w-[9.5rem] text-center font-display text-[15px] font-bold">{quarterLabel(quarter)}</span>
        {canNext ? (
          <Link href={href(nextTarget)} scroll={false} aria-label="Kuartal berikutnya" className={cn(arrow, "border-border bg-card hover:border-foreground/50")}>
            <ChevronRight size={18} />
          </Link>
        ) : (
          <span aria-hidden className={cn(arrow, "cursor-not-allowed border-border bg-card opacity-40")}>
            <ChevronRight size={18} />
          </span>
        )}
        {period !== thisMonth && (
          <Link href={href(thisMonth)} scroll={false} className="ml-auto inline-flex h-9 items-center rounded-full border-2 border-border bg-card px-3.5 text-[12.5px] font-semibold hover:border-foreground/50">
            Bulan ini
          </Link>
        )}
      </div>

      <div role="tablist" aria-label="Pilih bulan" className="grid grid-cols-3 gap-2 sm:flex">
        {months.map((m) => {
          const active = m === period;
          const future = m > thisMonth;
          const cls = cn(
            "inline-flex h-11 items-center justify-center gap-1.5 rounded-full border-2 px-5 text-[14px] font-semibold transition sm:min-w-[7.5rem]",
            active ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-card",
            future ? "cursor-not-allowed opacity-40" : !active && "hover:border-foreground/50"
          );
          const inner = (
            <>
              {monthShort(m)}
              {published.includes(m) && <Check size={14} strokeWidth={3} aria-label="Sudah terbit" />}
              {m === thisMonth && <span className={cn("rounded-full px-1.5 text-[10px] font-bold uppercase", active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>berjalan</span>}
            </>
          );
          return future ? (
            <span key={m} role="tab" aria-selected={false} aria-disabled className={cls}>
              {inner}
            </span>
          ) : (
            <Link key={m} href={href(m)} scroll={false} role="tab" aria-selected={active} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
