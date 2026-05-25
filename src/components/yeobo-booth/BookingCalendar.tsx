"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { YeoboBoothBookingWithFreelance } from "@/lib/yeobo-booth/types";

interface Props {
  bookings: YeoboBoothBookingWithFreelance[];
  /** YYYY-MM tampilan awal (di-clamp ke valid year). */
  initialMonth?: string;
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function BookingCalendar({ bookings, initialMonth }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => {
    if (initialMonth) {
      const [y, m] = initialMonth.split("-").map(Number);
      return new Date(y, (m ?? 1) - 1, 1);
    }
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  // Group bookings per YYYY-MM-DD
  const byDate = useMemo(() => {
    const map = new Map<string, YeoboBoothBookingWithFreelance[]>();
    for (const b of bookings) {
      const arr = map.get(b.tanggal) ?? [];
      arr.push(b);
      map.set(b.tanggal, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai));
    }
    return map;
  }, [bookings]);

  const year = cursor.getFullYear();
  const month0 = cursor.getMonth();
  const firstWeekday = new Date(year, month0, 1).getDay();
  const totalDays = daysInMonth(year, month0);
  const todayYMD = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const cells: Array<{ ymd: string; day: number } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) {
    cells.push({
      ymd: `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      day: d,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = cursor.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  function shiftMonth(delta: number) {
    setCursor(new Date(year, month0 + delta, 1));
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-bold text-foreground capitalize">
          {monthLabel}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() =>
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
            }
            className="px-2 py-1 text-xs font-medium rounded-md hover:bg-muted"
          >
            Hari ini
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Bulan berikutnya"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-1 text-center">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, idx) => {
          if (!c) {
            return (
              <div
                key={`pad-${idx}`}
                className="aspect-square md:aspect-auto md:min-h-[88px] rounded-lg bg-muted/30"
              />
            );
          }
          const items = byDate.get(c.ymd) ?? [];
          const isToday = c.ymd === todayYMD;
          return (
            <div
              key={c.ymd}
              className={cn(
                "rounded-lg border p-1.5 min-h-[88px] flex flex-col gap-1",
                isToday
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/30 transition"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-[11px] font-bold",
                    isToday ? "text-primary" : "text-foreground"
                  )}
                >
                  {c.day}
                </span>
                {items.length > 0 && (
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {items.length}×
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {items.slice(0, 3).map((b) => (
                  <Link
                    key={b.id}
                    href={`/admin/yeobo-booth/bookings/${b.id}`}
                    className={cn(
                      "text-[10px] font-medium truncate rounded px-1 py-0.5",
                      b.status === "cancelled"
                        ? "bg-muted text-muted-foreground line-through"
                        : b.payment_status === "lunas"
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-200"
                          : "bg-primary/15 text-primary hover:bg-primary/25"
                    )}
                  >
                    {b.jam_mulai.slice(0, 5)} {b.nama_klien}
                  </Link>
                ))}
                {items.length > 3 && (
                  <span className="text-[9px] text-muted-foreground px-1">
                    +{items.length - 3} lainnya
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
