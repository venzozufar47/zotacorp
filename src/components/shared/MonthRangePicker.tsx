"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Month-range picker — popover modal untuk pilih rentang bulan
 * (year-month → year-month). UX: click bulan pertama set "Dari",
 * click bulan kedua set "Sampai", click ketiga reset & mulai range
 * baru. Auto-swap kalau click kedua sebelum click pertama. Year
 * navigator (◀ tahun ▶) di atas grid bulan, label bahasa Indonesia.
 *
 * ## Contoh pemakaian
 *
 * ```tsx
 * const [open, setOpen] = useState(false);
 * const [range, setRange] = useState<{from: YM | null, to: YM | null}>({from: null, to: null});
 *
 * return (
 *   <>
 *     <button onClick={() => setOpen(true)}>
 *       {range.from && range.to
 *         ? `${ymLabelShort(range.from)} – ${ymLabelShort(range.to)}`
 *         : "Pilih periode"}
 *     </button>
 *     {open && (
 *       <MonthRangePicker
 *         value={range}
 *         onApply={(r) => {
 *           setRange(r);
 *           setOpen(false);
 *         }}
 *         onClose={() => setOpen(false)}
 *       />
 *     )}
 *   </>
 * );
 * ```
 *
 * Value/output pakai `{ year: number; month: number }`. Helper
 * `parseYM` / `formatYM` di-export untuk konversi dari/ke string
 * `"YYYY-MM"` kalau caller butuh.
 */

export interface YM {
  year: number;
  month: number;
}

export interface MonthRange {
  from: YM;
  to: YM;
}

const MONTH_LABELS_ID = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

const MONTH_LABELS_FULL_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/** Parse string "YYYY-MM" → YM. Return null kalau invalid. */
export function parseYM(s: string | undefined | null): YM | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

/** Format YM → "YYYY-MM" string (untuk URL params, DB, dst). */
export function formatYM(d: YM): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}`;
}

function ymToNum(d: YM): number {
  return d.year * 12 + d.month;
}

/** Label panjang Indonesia: "Januari 2025". */
export function ymLabel(d: YM | null): string {
  if (!d) return "—";
  return `${MONTH_LABELS_FULL_ID[d.month - 1]} ${d.year}`;
}

/** Label pendek Indonesia: "Jan 2025". Cocok untuk trigger button. */
export function ymLabelShort(d: YM | null): string {
  if (!d) return "—";
  return `${MONTH_LABELS_ID[d.month - 1]} ${d.year}`;
}

export function MonthRangePicker({
  value,
  onApply,
  onClose,
  title = "Pilih rentang bulan",
  hint = "Klik bulan untuk set Dari. Klik bulan kedua untuk set Sampai.",
}: {
  value: { from: YM | null; to: YM | null };
  onApply: (range: MonthRange) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
}) {
  const now = new Date();
  // Portal target = document.body so the fixed overlay escapes any
  // transformed ancestor (e.g. `animate-fade-up`), which would otherwise
  // re-anchor `position: fixed` and make the modal drift down the page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [pendingFrom, setPendingFrom] = useState<YM | null>(value.from);
  const [pendingTo, setPendingTo] = useState<YM | null>(value.to);
  // Year yang sedang ditampilkan di grid. Default: tahun dari pendingFrom
  // (atau pendingTo, atau current year).
  const [viewYear, setViewYear] = useState<number>(
    value.from?.year ?? value.to?.year ?? now.getFullYear()
  );

  function handlePick(year: number, month: number) {
    const clicked: YM = { year, month };
    // Click ketiga (sudah ada from & to) → mulai range baru.
    if (pendingFrom && pendingTo) {
      setPendingFrom(clicked);
      setPendingTo(null);
      return;
    }
    // Click pertama → set from.
    if (!pendingFrom) {
      setPendingFrom(clicked);
      return;
    }
    // Click kedua → set to. Swap kalau kebalik.
    if (ymToNum(clicked) < ymToNum(pendingFrom)) {
      setPendingTo(pendingFrom);
      setPendingFrom(clicked);
    } else {
      setPendingTo(clicked);
    }
  }

  function reset() {
    setPendingFrom(null);
    setPendingTo(null);
  }

  function apply() {
    if (!pendingFrom || !pendingTo) return;
    onApply({ from: pendingFrom, to: pendingTo });
  }

  function monthState(year: number, month: number) {
    const cur = ymToNum({ year, month });
    const isFrom =
      pendingFrom && pendingFrom.year === year && pendingFrom.month === month;
    const isTo =
      pendingTo && pendingTo.year === year && pendingTo.month === month;
    const inRange =
      pendingFrom &&
      pendingTo &&
      cur > ymToNum(pendingFrom) &&
      cur < ymToNum(pendingTo);
    const isCurrent =
      year === now.getFullYear() && month === now.getMonth() + 1;
    return { isFrom, isTo, inRange, isCurrent };
  }

  const applyDisabled = !pendingFrom || !pendingTo;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-foreground/30" onClick={onClose}>
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] rounded-2xl bg-card border border-border p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
            {hint}
          </p>
        </div>

        {/* Pending range summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
              Dari
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-foreground tabular-nums">
              {ymLabel(pendingFrom)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
              Sampai
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-foreground tabular-nums">
              {ymLabel(pendingTo)}
            </p>
          </div>
        </div>

        {/* Year navigator */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            className="press-feedback p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground"
            aria-label="Tahun sebelumnya"
          >
            <ChevronLeft size={16} strokeWidth={2.4} />
          </button>
          <p className="text-base font-semibold text-foreground tabular-nums">
            {viewYear}
          </p>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            className="press-feedback p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground"
            aria-label="Tahun berikutnya"
          >
            <ChevronRight size={16} strokeWidth={2.4} />
          </button>
        </div>

        {/* Month grid: 4 kolom × 3 baris */}
        <div className="grid grid-cols-4 gap-1.5">
          {MONTH_LABELS_ID.map((label, idx) => {
            const month = idx + 1;
            const state = monthState(viewYear, month);
            let cls =
              "press-feedback py-2 rounded-md text-xs font-semibold transition-colors ";
            if (state.isFrom || state.isTo) {
              cls += "bg-primary text-primary-foreground";
            } else if (state.inRange) {
              cls += "bg-primary/15 text-primary";
            } else {
              cls += "hover:bg-muted/50 text-foreground";
            }
            if (state.isCurrent && !(state.isFrom || state.isTo)) {
              cls += " ring-1 ring-primary/40";
            }
            return (
              <button
                key={month}
                type="button"
                onClick={() => handlePick(viewYear, month)}
                className={cls}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Action footer */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={reset}
            className="press-feedback text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={!pendingFrom && !pendingTo}
          >
            Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="press-feedback h-9 px-3 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={applyDisabled}
              className="press-feedback h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Terapkan
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
