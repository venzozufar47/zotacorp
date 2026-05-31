"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { YM } from "./MonthRangePicker";

/**
 * Single-month picker — popover modal untuk pilih satu bulan
 * (year-month). UX: navigasi tahun via ◀/▶ di atas grid bulan, klik
 * bulan untuk pilih. Companion shared dari MonthRangePicker — share
 * type `YM` dan styling convention yang sama.
 *
 * ## Contoh pemakaian
 *
 * ```tsx
 * const [open, setOpen] = useState(false);
 * const [val, setVal] = useState<YM | null>(null);
 *
 * return (
 *   <>
 *     <button onClick={() => setOpen(true)}>
 *       {val ? ymLabelShort(val) : "Pilih bulan"}
 *     </button>
 *     {open && (
 *       <MonthPicker
 *         value={val}
 *         onApply={(ym) => { setVal(ym); setOpen(false); }}
 *         onClose={() => setOpen(false)}
 *         allowClear
 *         onClear={() => { setVal(null); setOpen(false); }}
 *       />
 *     )}
 *   </>
 * );
 * ```
 *
 * Pass `allowClear=true` + `onClear` kalau caller perlu "kosongkan"
 * action (mis. hapus override). Re-export helpers `parseYM`/`formatYM`/
 * `ymLabel`/`ymLabelShort` lewat MonthRangePicker.
 */

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

export function MonthPicker({
  value,
  onApply,
  onClose,
  title = "Pilih bulan",
  allowClear = false,
  onClear,
}: {
  value: YM | null;
  onApply: (ym: YM) => void;
  onClose: () => void;
  title?: string;
  allowClear?: boolean;
  onClear?: () => void;
}) {
  const now = new Date();
  // Portal to document.body so the fixed overlay escapes transformed
  // ancestors (e.g. `animate-fade-up`) that would re-anchor `fixed`.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [viewYear, setViewYear] = useState<number>(
    value?.year ?? now.getFullYear()
  );

  function monthState(year: number, month: number) {
    const isSelected =
      value !== null && value.year === year && value.month === month;
    const isCurrent =
      year === now.getFullYear() && month === now.getMonth() + 1;
    return { isSelected, isCurrent };
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-foreground/30" onClick={onClose}>
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] rounded-2xl bg-card border border-border p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-foreground">{title}</p>

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

        {/* Month grid */}
        <div className="grid grid-cols-4 gap-1.5">
          {MONTH_LABELS_ID.map((label, idx) => {
            const month = idx + 1;
            const state = monthState(viewYear, month);
            let cls =
              "press-feedback py-2 rounded-md text-xs font-semibold transition-colors ";
            if (state.isSelected) {
              cls += "bg-primary text-primary-foreground";
            } else {
              cls += "hover:bg-muted/50 text-foreground";
            }
            if (state.isCurrent && !state.isSelected) {
              cls += " ring-1 ring-primary/40";
            }
            return (
              <button
                key={month}
                type="button"
                onClick={() => onApply({ year: viewYear, month })}
                className={cls}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          {allowClear && onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="press-feedback inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-destructive"
            >
              <X size={11} strokeWidth={2.4} />
              Kosongkan
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="press-feedback h-9 px-3 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Batal
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
