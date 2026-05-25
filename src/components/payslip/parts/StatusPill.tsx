"use client";

import type { ReactNode } from "react";

export type StatusPillTone = "teal" | "green" | "amber" | "red" | "neutral";

/**
 * Small pill used across the payslip detail view (status row, hero
 * sub-stats, history rows). Tone hex values match the Slip Gaji design
 * exactly so visual identity is consistent regardless of theme.
 */
interface Props {
  tone?: StatusPillTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const TONE_STYLES: Record<StatusPillTone, { bg: string; fg: string; bd: string }> = {
  teal:    { bg: "#eef7f9", fg: "#0c5d6c", bd: "#b5dde6" },
  green:   { bg: "#e8f7ee", fg: "#1b7a3a", bd: "#bfe6cd" },
  amber:   { bg: "#fff4e0", fg: "#8a5a00", bd: "#f3d699" },
  red:     { bg: "#fdecea", fg: "#a8261d", bd: "#f6c5bf" },
  neutral: { bg: "#f5f5f7", fg: "#3d3d40", bd: "#d2d2d7" },
};

export function StatusPill({ tone = "neutral", icon, children, className = "" }: Props) {
  const s = TONE_STYLES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold uppercase tracking-[0.06em] ${className}`}
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}` }}
    >
      {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
      {children}
    </span>
  );
}
