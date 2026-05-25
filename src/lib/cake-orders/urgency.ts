/**
 * Urgency classification for a cake order's scheduled_at, used to
 * tint kanban cards + the slip hero banner. Same logic across all
 * Haengbocake surfaces so a "late" card on the board reads the same
 * way as a "Slip TANGGAL LAMPAU" banner on the slip page.
 *
 *  < 0      → "late"   (scheduled in the past)
 *  0 or +1  → "soon"   (today or tomorrow — top priority)
 *  +2..+5   → "week"   (this week)
 *  > +5     → "far"    (later)
 *
 * Jakarta-timezone awareness lives in the caller — pass a Date or
 * ISO string already normalised. The helper just compares calendar
 * days using UTC-midnight boundaries.
 */

export type Urgency = "late" | "soon" | "week" | "far";

function midnightUTC(d: Date | string): number {
  const dt = typeof d === "string" ? new Date(d) : d;
  return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

export function urgencyFor(
  scheduledAt: Date | string,
  today: Date = new Date()
): Urgency {
  const diff = Math.round(
    (midnightUTC(scheduledAt) - midnightUTC(today)) / 86_400_000
  );
  if (diff < 0) return "late";
  if (diff <= 1) return "soon";
  if (diff <= 5) return "week";
  return "far";
}

/** Border + soft fill colors for a card with the given urgency. */
export const URGENCY_TOKENS: Record<
  Urgency,
  { border: string; soft: string; fg: string }
> = {
  late: { border: "var(--cake-late)", soft: "var(--cake-late-soft)", fg: "#991B1B" },
  soon: { border: "var(--cake-today)", soft: "var(--cake-today-soft)", fg: "#065F46" },
  week: { border: "var(--cake-week)", soft: "var(--cake-week-soft)", fg: "#92400E" },
  far: { border: "var(--cake-far)", soft: "var(--cake-far-soft)", fg: "var(--cake-fg-soft)" },
};
