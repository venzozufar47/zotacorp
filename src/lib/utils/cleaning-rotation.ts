/**
 * Duty-rotation math for cleaning checklists shared by 2+ employees who take
 * turns ("selang-seling"). Generalizes the payroll paired-alternating week
 * parity (idx % 2) to an N-member round-robin (idx mod N).
 *
 * Pure helpers — kept out of the "use server" actions file so they can be
 * imported by both the server actions and the admin client preview, guaranteeing
 * server & client never diverge.
 *
 * TZ-safety: all date math is done on UTC-midnight timestamps parsed from
 * YYYY-MM-DD strings (mirrors jakartaDateMinusDays), never on a server-local
 * Date.getDay(). The weekday of a fixed calendar date is timezone-independent,
 * so utcDow(ymd) equals jakartaDayOfWeek(thatDate) — the gate sites pass the
 * jakarta dow and it matches the internal math.
 */
import { isWorkdayFor } from "@/lib/utils/workdays";

export type RotationMode = "daily" | "weekly";

const DAY_MS = 24 * 60 * 60 * 1000;

function ymdToUtc(ymd: string): number {
  return Date.parse(ymd + "T00:00:00Z");
}
/** Weekday 0=Sun..6=Sat of a calendar date (TZ-immune). */
function utcDow(ymd: string): number {
  return new Date(ymdToUtc(ymd)).getUTCDay();
}
/** Whole-day difference (to - from) in UTC days. */
function dayDiff(fromYmd: string, toYmd: string): number {
  return Math.round((ymdToUtc(toYmd) - ymdToUtc(fromYmd)) / DAY_MS);
}
/** Number of scheduled weekdays in the bitmask (0..7). */
function popcountWeekdays(weekdays: number): number {
  let c = 0;
  for (let d = 0; d < 7; d++) if (isWorkdayFor(weekdays, d)) c++;
  return c;
}

/**
 * DAILY index: 0-based position of `dateYmd` among all scheduled days since the
 * anchor (inclusive). Closed-form O(1): full weeks × scheduled-per-week + the
 * scheduled days in the leftover partial week starting at the anchor weekday.
 * (`dateYmd` is assumed to be a scheduled day — the caller checks isWorkdayFor.)
 */
function dailyIndex(anchorYmd: string, dateYmd: string, weekdays: number): number {
  const per = popcountWeekdays(weekdays);
  if (per === 0) return 0;
  const totalDays = dayDiff(anchorYmd, dateYmd) + 1; // inclusive day count, >= 1 in normal use
  const fullWeeks = Math.floor(totalDays / 7);
  const rem = totalDays - fullWeeks * 7;
  const anchorDow = utcDow(anchorYmd);
  let partial = 0;
  for (let k = 0; k < rem; k++) {
    if (isWorkdayFor(weekdays, (anchorDow + k) % 7)) partial++;
  }
  return fullWeeks * per + partial - 1;
}

/**
 * WEEKLY index: calendar-week (Monday-based) count since the anchor's week.
 * Every scheduled day in the same calendar week shares one owner; the rotation
 * advances each week (week-on / week-off for 2 members).
 */
function weeklyIndex(anchorYmd: string, dateYmd: string): number {
  const anchorDow = utcDow(anchorYmd); // 0=Sun..6=Sat
  const daysSinceMonday = (anchorDow + 6) % 7; // Mon->0, Tue->1, ... Sun->6
  const weekStart = ymdToUtc(anchorYmd) - daysSinceMonday * DAY_MS;
  const diff = Math.round((ymdToUtc(dateYmd) - weekStart) / DAY_MS);
  return Math.floor(diff / 7);
}

/** Round-robin owner (0..N-1) for a scheduled date; -1 if not scheduled or
 *  before the rotation's anchor (it didn't exist yet). */
export function dutyOwnerIndex(o: {
  dateYmd: string;
  anchorYmd: string;
  dow: number;
  weekdays: number;
  mode: RotationMode;
  memberCount: number;
}): number {
  if (o.memberCount <= 1) return 0;
  if (!isWorkdayFor(o.weekdays, o.dow)) return -1;
  if (dayDiff(o.anchorYmd, o.dateYmd) < 0) return -1;
  const idx =
    o.mode === "weekly"
      ? weeklyIndex(o.anchorYmd, o.dateYmd)
      : dailyIndex(o.anchorYmd, o.dateYmd, o.weekdays);
  return ((idx % o.memberCount) + o.memberCount) % o.memberCount;
}

/**
 * Is this member on duty on `dateYmd`? memberCount <= 1 (standalone / null
 * group) → always true, so existing single-user assignments behave identically.
 */
export function isOnDutyToday(o: {
  dateYmd: string;
  anchorYmd: string;
  dow: number;
  weekdays: number;
  mode: RotationMode;
  memberOrder: number;
  memberCount: number;
}): boolean {
  if (o.memberCount <= 1) return true;
  const owner = dutyOwnerIndex(o);
  return owner === o.memberOrder;
}

export interface PreviewDay {
  ymd: string;
  dow: number;
  ownerIndex: number;
  /** When skip_holidays is on and this date is a national holiday: the holiday
   *  name (ownerIndex is -1 — nobody is on duty, the day is skipped). */
  holiday: string | null;
}

/** The next `count` scheduled days from `fromYmd` with their on-duty owner
 *  index — for the admin preview. Pure; safe to call client-side. When
 *  skipHolidays is on, dates in `holidays` (ymd → name) are marked as skipped
 *  (ownerIndex -1) — matching the server gate, which drops them for everyone
 *  while leaving the calendar owner sequence unchanged. */
export function buildRotationPreview(o: {
  fromYmd: string;
  weekdays: number;
  mode: RotationMode;
  anchorYmd: string;
  memberCount: number;
  count?: number;
  holidays?: ReadonlyMap<string, string>;
  skipHolidays?: boolean;
}): PreviewDay[] {
  const want = o.count ?? 14;
  const out: PreviewDay[] = [];
  if (popcountWeekdays(o.weekdays) === 0) return out;
  let cursor = ymdToUtc(o.fromYmd);
  let guard = 0;
  while (out.length < want && guard < 400) {
    const date = new Date(cursor);
    const ymd = date.toISOString().slice(0, 10);
    const dow = date.getUTCDay();
    if (isWorkdayFor(o.weekdays, dow)) {
      const holiday =
        o.skipHolidays && o.holidays?.has(ymd) ? o.holidays.get(ymd) ?? "Libur" : null;
      out.push({
        ymd,
        dow,
        holiday,
        ownerIndex: holiday
          ? -1
          : dutyOwnerIndex({
              dateYmd: ymd,
              anchorYmd: o.anchorYmd,
              dow,
              weekdays: o.weekdays,
              mode: o.mode,
              memberCount: o.memberCount,
            }),
      });
    }
    cursor += DAY_MS;
    guard++;
  }
  return out;
}
