"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
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

  // List view (mobile): hanya hari yang punya booking di bulan ini,
  // urut by tanggal lalu jam.
  const monthYM = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  const dailyList = useMemo(() => {
    const days = Array.from(byDate.keys())
      .filter((d) => d.startsWith(monthYM))
      .sort();
    return days.map((ymd) => ({
      ymd,
      items: byDate.get(ymd) ?? [],
    }));
  }, [byDate, monthYM]);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 md:p-5">
      <div className="flex items-center justify-between mb-3 md:mb-4 gap-2">
        <h2 className="font-display text-base md:text-xl font-bold text-foreground capitalize truncate">
          {monthLabel}
        </h2>
        <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-lg hover:bg-muted active:bg-muted text-muted-foreground"
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() =>
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
            }
            className="px-2 py-1.5 text-xs font-medium rounded-md hover:bg-muted active:bg-muted"
          >
            Hari ini
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="p-2 rounded-lg hover:bg-muted active:bg-muted text-muted-foreground"
            aria-label="Bulan berikutnya"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Mobile: list view grouped by date — lebih mudah di-baca di
          layar sempit dibanding grid 7 kolom yang men-squash konten. */}
      <div className="md:hidden">
        {dailyList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Tidak ada booking di bulan ini.
          </p>
        ) : (
          <div className="space-y-3">
            {dailyList.map(({ ymd, items }) => {
              const isToday = ymd === todayYMD;
              const d = new Date(ymd + "T00:00:00");
              const dayNum = d.getDate();
              const weekday = d.toLocaleDateString("id-ID", {
                weekday: "short",
              });
              return (
                <div key={ymd} className="flex gap-3">
                  <div
                    className={cn(
                      "shrink-0 w-12 rounded-xl border-2 flex flex-col items-center justify-center py-1",
                      isToday
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground"
                    )}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      {weekday}
                    </span>
                    <span className="font-display font-bold text-lg leading-none">
                      {dayNum}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {items.map((b) => (
                      <Link
                        key={b.id}
                        href={`/admin/yeobo-booth/bookings/${b.id}`}
                        className={cn(
                          "block rounded-xl border p-2.5",
                          b.status === "cancelled"
                            ? "border-border bg-muted/40 opacity-60"
                            : b.booking_type === "space_rent"
                              ? "border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40"
                              : b.payment_status === "lunas"
                                ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                                : "border-primary/30 bg-primary/5"
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              "font-semibold text-sm truncate",
                              b.status === "cancelled" && "line-through"
                            )}
                          >
                            {b.nama_klien}
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                            {b.jam_mulai.slice(0, 5)}–
                            {b.jam_selesai.slice(0, 5)}
                          </span>
                        </div>
                        {b.lokasi_event && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 truncate">
                            <MapPin size={10} />
                            {b.lokasi_event}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Desktop: grid month view. */}
      <div className="hidden md:block">
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
                          : b.booking_type === "space_rent"
                            ? "bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-200"
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
    </div>
  );
}
