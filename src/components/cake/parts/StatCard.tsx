"use client";

import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  /** Accent color for the left border + value text. Pass a hex / CSS
   *  variable (e.g., "var(--cake-primary)"). */
  accent?: string;
  mono?: boolean;
}

/**
 * Accent-bordered stat tile used in archive summary row. Compact —
 * value is large and tabular-numbered; label is small uppercase.
 */
export function StatCard({ label, value, accent = "var(--cake-muted)", mono }: Props) {
  return (
    <div
      className="rounded-2xl border-2 px-4 py-3"
      style={{
        background: "var(--cake-surface)",
        borderColor: "var(--cake-border)",
        borderLeftWidth: 4,
        borderLeftColor: accent,
      }}
    >
      <div
        className="text-[10.5px] font-bold uppercase tracking-[0.08em]"
        style={{ color: "var(--cake-muted)" }}
      >
        {label}
      </div>
      <div
        className="text-[22px] font-bold mt-1 tabular-nums leading-none"
        style={{
          color: accent,
          fontFamily: mono ? "var(--font-mono, ui-monospace)" : undefined,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
    </div>
  );
}
