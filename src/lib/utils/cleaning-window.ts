/**
 * Time-of-day window for a cleaning assignment (when it may be performed).
 *   anytime  → no restriction
 *   before   → only until window_end
 *   after    → only from window_start
 *   between  → only within window_start..window_end
 * Times are 'HH:MM' in the org's local timezone.
 *
 * Pure helpers — kept out of the "use server" actions file (whose exports must
 * all be async functions).
 */
export type CleaningWindowMode = "anytime" | "before" | "after" | "between";

function hhmmToMin(s: string | null): number | null {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/** Is `nowHhmm` within the configured window? Open/anytime → true. */
export function cleaningWindowOpen(
  mode: string,
  start: string | null,
  end: string | null,
  nowHhmm: string
): boolean {
  const n = hhmmToMin(nowHhmm);
  if (n == null) return true;
  const s = hhmmToMin(start);
  const e = hhmmToMin(end);
  if (mode === "before") return e == null || n <= e;
  if (mode === "after") return s == null || n >= s;
  if (mode === "between") return s == null || e == null || (n >= s && n <= e);
  return true; // anytime / unknown
}

/** Human label for the window, or null if unrestricted. */
export function cleaningWindowLabel(
  mode: string,
  start: string | null,
  end: string | null
): string | null {
  if (mode === "before" && end) return `Bisa dikerjakan sebelum ${end}`;
  if (mode === "after" && start) return `Bisa dikerjakan setelah ${start}`;
  if (mode === "between" && start && end) return `Bisa dikerjakan ${start}–${end}`;
  return null;
}
