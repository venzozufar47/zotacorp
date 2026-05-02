"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface Employee {
  id: string;
  full_name: string;
  email: string;
}

interface AttendanceFiltersProps {
  /** Resolved month (1–12) for current view. */
  month: number;
  /** Resolved 4-digit year. */
  year: number;
  /** Empty = "all employees". */
  selectedUserId: string;
  employees: Employee[];
}

const STORAGE_KEY = "zota:admin:attendance:lastFilter";

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function AttendanceFilters({
  month,
  year,
  selectedUserId,
  employees,
}: AttendanceFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Persist last-viewed filter (month/year/userId) per browser. Cold open
  // without explicit query params restores from storage.
  const restoredOnce = useRef(false);
  useEffect(() => {
    const hasExplicit =
      searchParams.has("month") ||
      searchParams.has("year") ||
      searchParams.has("start") ||
      searchParams.has("end") ||
      searchParams.has("userId") ||
      searchParams.has("focus");

    if (!hasExplicit && !restoredOnce.current) {
      restoredOnce.current = true;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as {
            month?: number;
            year?: number;
            userId?: string;
          };
          if (saved?.month && saved?.year) {
            const params = new URLSearchParams();
            params.set("month", String(saved.month));
            params.set("year", String(saved.year));
            if (saved.userId) params.set("userId", saved.userId);
            router.replace(`${pathname}?${params.toString()}`);
            return;
          }
        }
      } catch {}
      return;
    }

    // Save when admin explicitly navigates a filter.
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          month,
          year,
          userId: selectedUserId || undefined,
        })
      );
    } catch {}
  }, [month, year, selectedUserId, searchParams, pathname, router]);

  function setFilter(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    // Migrating away from date-range filter — drop start/end + page so
    // pagination resets.
    params.delete("start");
    params.delete("end");
    params.delete("page");
    params.delete("focus"); // any pending notif jump is consumed once
    router.push(`${pathname}?${params.toString()}`);
  }

  function setPeriod(m: number, y: number) {
    setFilter({ month: String(m), year: String(y) });
  }

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setPeriod(m, y);
  }

  const hasUserFilter = selectedUserId !== "";

  return (
    <div className="bg-card rounded-2xl border-2 border-foreground shadow-hard p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Bulan</Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="size-10 inline-flex items-center justify-center rounded-xl border-2 border-border bg-white hover:bg-muted"
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft size={16} />
            </button>
            <select
              value={month}
              onChange={(e) => setPeriod(Number(e.target.value), year)}
              className={cn(
                "flex-1 rounded-xl border-2 border-border bg-white px-3 py-2 text-sm font-medium h-10 outline-none transition-all",
                "focus-visible:border-primary focus-visible:shadow-hard-violet"
              )}
            >
              {MONTHS_ID.map((label, i) => (
                <option key={i + 1} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setPeriod(month, Number(e.target.value))}
              className={cn(
                "rounded-xl border-2 border-border bg-white px-3 py-2 text-sm font-medium h-10 outline-none transition-all tabular-nums",
                "focus-visible:border-primary focus-visible:shadow-hard-violet"
              )}
            >
              {Array.from({ length: 5 }, (_, i) => year - 2 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="size-10 inline-flex items-center justify-center rounded-xl border-2 border-border bg-white hover:bg-muted"
              aria-label="Bulan berikutnya"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Karyawan</Label>
          <select
            value={selectedUserId || "all"}
            onChange={(e) =>
              setFilter({
                userId: e.target.value === "all" ? "" : e.target.value,
              })
            }
            className={cn(
              "flex w-full items-center rounded-xl border-2 border-border bg-white px-3.5 py-2 text-sm font-medium h-10 outline-none transition-all",
              "focus-visible:border-primary focus-visible:shadow-hard-violet"
            )}
          >
            <option value="all">Semua karyawan</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name || emp.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {hasUserFilter && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilter({ userId: "" })}
            className="text-xs text-muted-foreground h-7 gap-1"
          >
            <X size={12} />
            Clear karyawan filter
          </Button>
        </div>
      )}
    </div>
  );
}
