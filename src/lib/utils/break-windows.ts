import type { BreakWindow } from "@/lib/supabase/types";

const HHMM_RE = /^\d{1,2}:\d{2}$/;

function normHhmm(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

/** Parse + sanitize profiles.break_windows (jsonb) into a typed list. */
export function parseBreakWindows(raw: unknown): BreakWindow[] {
  if (!Array.isArray(raw)) return [];
  const out: BreakWindow[] = [];
  for (const w of raw) {
    if (
      w &&
      typeof w === "object" &&
      typeof (w as { start?: unknown }).start === "string" &&
      typeof (w as { end?: unknown }).end === "string"
    ) {
      const start = (w as { start: string }).start;
      const end = (w as { end: string }).end;
      if (HHMM_RE.test(start) && HHMM_RE.test(end)) {
        out.push({ start: normHhmm(start), end: normHhmm(end) });
      }
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

/** Local wall-clock "HH:MM" (24h, zero-padded) of `date` in `timezone`. */
export function localHhmm(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * The break window whose [start, end) contains `date`'s local time, or null.
 * Windows live within work hours so plain HH:MM string comparison is safe.
 */
export function activeBreakWindow(
  date: Date,
  windows: BreakWindow[],
  timezone: string
): BreakWindow | null {
  const now = localHhmm(date, timezone);
  for (const w of windows) {
    if (now >= w.start && now < w.end) return w;
  }
  return null;
}

export function windowKey(w: { start: string; end: string }): string {
  return `${w.start}-${w.end}`;
}
