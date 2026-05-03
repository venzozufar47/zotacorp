"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Employee {
  id: string;
  full_name: string;
  email: string;
}

interface Props {
  month: number;
  year: number;
  selectedUserId: string;
  selectedBU: string;
  employees: Employee[];
  businessUnits: string[];
}

const MONTHS_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const STORAGE_KEY = "zota:admin:attendance:lastFilter";

/**
 * Single compact filter bar shared across Recap / Matrix / Live tabs.
 *
 * Two controls:
 *   1. Month — prev/select/year/next
 *   2. Subject — combined "all / BU / employee" select with optgroups.
 *
 * Setting a BU clears userId; setting an employee clears bu. The actual
 * filtering happens server-side via URL params in the parent page.
 */
export function AttendanceTopFilter({
  month,
  year,
  selectedUserId,
  selectedBU,
  employees,
  businessUnits,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Restore last filter on cold open (no explicit query params).
  const restoredOnce = useRef(false);
  useEffect(() => {
    const hasExplicit =
      sp.has("month") ||
      sp.has("year") ||
      sp.has("userId") ||
      sp.has("bu") ||
      sp.has("focus");
    if (!hasExplicit && !restoredOnce.current) {
      restoredOnce.current = true;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as {
            month?: number;
            year?: number;
            userId?: string;
            bu?: string;
          };
          if (saved?.month && saved?.year) {
            const next = new URLSearchParams();
            next.set("month", String(saved.month));
            next.set("year", String(saved.year));
            if (saved.userId) next.set("userId", saved.userId);
            if (saved.bu) next.set("bu", saved.bu);
            // Preserve current view tab if present
            const v = sp.get("view");
            if (v) next.set("view", v);
            router.replace(`${pathname}?${next.toString()}`);
            return;
          }
        }
      } catch {}
      return;
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          month,
          year,
          userId: selectedUserId || undefined,
          bu: selectedBU || undefined,
        })
      );
    } catch {}
  }, [month, year, selectedUserId, selectedBU, sp, pathname, router]);

  function setParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    params.delete("focus");
    router.push(`${pathname}?${params.toString()}`);
  }

  function setPeriod(m: number, y: number) {
    setParams({ month: String(m), year: String(y) });
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

  function setSubject(value: string) {
    if (value === "all") {
      setParams({ userId: "", bu: "" });
    } else if (value.startsWith("bu:")) {
      setParams({ bu: value.slice(3), userId: "" });
    } else if (value.startsWith("user:")) {
      setParams({ userId: value.slice(5), bu: "" });
    }
  }

  const subjectValue = selectedBU
    ? `bu:${selectedBU}`
    : selectedUserId
      ? `user:${selectedUserId}`
      : "all";

  const selectClass = cn(
    "h-8 rounded-full border border-border/70 bg-card px-3 text-[12.5px] font-medium text-foreground outline-none transition",
    "hover:bg-muted focus-visible:border-[var(--teal-500)] focus-visible:shadow-[0_0_0_3px_var(--teal-100)]"
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Month control */}
      <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border/70 bg-card">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="grid place-items-center size-7 rounded-full hover:bg-muted transition"
          aria-label="Previous month"
        >
          <ChevronLeft size={13} />
        </button>
        <select
          value={month}
          onChange={(e) => setPeriod(Number(e.target.value), year)}
          className="h-7 rounded-full bg-transparent px-2 text-[12.5px] font-medium outline-none cursor-pointer"
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
          className="h-7 rounded-full bg-transparent px-1.5 text-[12.5px] font-medium tabular-nums outline-none cursor-pointer"
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
          className="grid place-items-center size-7 rounded-full hover:bg-muted transition"
          aria-label="Next month"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {/* Subject (employee or BU) */}
      <select
        value={subjectValue}
        onChange={(e) => setSubject(e.target.value)}
        className={selectClass}
        title="Filter by employee or business unit"
      >
        <option value="all">Semua</option>
        {businessUnits.length > 0 && (
          <optgroup label="Business Unit">
            {businessUnits.map((bu) => (
              <option key={bu} value={`bu:${bu}`}>
                {bu}
              </option>
            ))}
          </optgroup>
        )}
        {employees.length > 0 && (
          <optgroup label="Karyawan">
            {employees.map((e) => (
              <option key={e.id} value={`user:${e.id}`}>
                {e.full_name || e.email}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
