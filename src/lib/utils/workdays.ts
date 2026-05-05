/**
 * Workday bitmask helpers. `profiles.workdays` is a 7-bit bitmask
 * where bit `n` corresponds to JS `Date.getDay()` value `n`:
 *   0 = Sunday, 1 = Monday, …, 6 = Saturday.
 *
 * Default `WORKDAYS_DEFAULT = 126` (0b1111110) = Mon–Sat. Matches the
 * typical Indonesian small-business work week.
 *
 * Only consulted when `profiles.workday_check_enabled = true`.
 */

export const WORKDAYS_DEFAULT = 126;
export const WORKDAYS_ALL = 127;

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_LABELS_ID: Record<Weekday, string> = {
  0: "Min",
  1: "Sen",
  2: "Sel",
  3: "Rab",
  4: "Kam",
  5: "Jum",
  6: "Sab",
};

export const WEEKDAY_LABELS_EN: Record<Weekday, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

export function isWorkdayFor(workdays: number, dow: number): boolean {
  if (dow < 0 || dow > 6) return false;
  return (workdays & (1 << dow)) !== 0;
}

export function setWorkdayBit(
  workdays: number,
  dow: Weekday,
  on: boolean
): number {
  return on ? workdays | (1 << dow) : workdays & ~(1 << dow);
}

/** Return the `Date.getDay()` value for `date` interpreted in `tz`. */
export function jakartaDayOfWeek(d: Date, tz: string): Weekday {
  // Intl gives us the weekday name; map to a number.
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(d);
  const map: Record<string, Weekday> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[name] ?? 0;
}
