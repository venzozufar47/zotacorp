"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

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
        {value.id === "custom" && value.from && value.to
          ? `${value.from} – ${value.to}`
          : "Custom"}
        <ChevronDown size={11} strokeWidth={2.4} className="opacity-70" />
      </button>
      {open && (
        <CustomRangePopover
          value={value}
          onChange={(v) => {
            onChange(v);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function CustomRangePopover({
  value,
  onChange,
  onClose,
}: {
  value: Period;
  onChange: (p: Period) => void;
  onClose: () => void;
}) {
  const now = new Date();
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [from, setFrom] = useState(value.from ?? defaultTo);
  const [to, setTo] = useState(value.to ?? defaultTo);
  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/30"
      onClick={onClose}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] rounded-xl bg-card border border-border p-4 shadow-lg space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-foreground">
          Rentang custom
        </p>
        <label className="block text-xs text-muted-foreground">
          Dari
          <input
            type="month"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="block mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Sampai
          <input
            type="month"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="block mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3 rounded-lg border border-border text-sm font-semibold text-muted-foreground"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onChange({ id: "custom", from, to })}
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
          >
            Terapkan
          </button>
        </div>
      </div>
    </div>
  );
}
