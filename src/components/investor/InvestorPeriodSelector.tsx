"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import {
  MonthRangePicker,
  formatYM,
  parseYM,
  ymLabelShort,
} from "@/components/shared/MonthRangePicker";

export type PeriodId = "3m" | "6m" | "12m" | "ytd" | "all" | "custom";
export interface Period {
  id: PeriodId;
  from?: string; // YYYY-MM (for custom)
  to?: string;
}

const PRESETS: Array<{ id: Exclude<PeriodId, "custom">; label: string }> = [
  { id: "3m", label: "3 bln" },
  { id: "6m", label: "6 bln" },
  { id: "12m", label: "12 bln" },
  { id: "ytd", label: "YTD" },
  { id: "all", label: "Sejak masuk" },
];

export function InvestorPeriodSelector({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const [open, setOpen] = useState(false);
  const customLabel =
    value.id === "custom" && value.from && value.to
      ? `${ymLabelShort(parseYM(value.from))} – ${ymLabelShort(parseYM(value.to))}`
      : "Custom";
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-xl border border-border"
      style={{ background: "var(--surface-alt)" }}
    >
      {PRESETS.map((p) => {
        const active = value.id === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange({ id: p.id })}
            className={`press-feedback px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              active
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`press-feedback px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
          value.id === "custom"
            ? "bg-card text-primary shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <CalendarDays size={12} strokeWidth={2.2} />
        {customLabel}
        <ChevronDown size={11} strokeWidth={2.4} className="opacity-70" />
      </button>
      {open && (
        <MonthRangePicker
          value={{ from: parseYM(value.from), to: parseYM(value.to) }}
          onApply={(range) => {
            onChange({
              id: "custom",
              from: formatYM(range.from),
              to: formatYM(range.to),
            });
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
