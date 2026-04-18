/**
 * Celebrations (birthday + work anniversary) math.
 *
 * All functions are pure — no clock, no network, no database. The caller
 * supplies `today` (a `Date` representing "now") and `tz` (the app's IANA
 * zone from `attendance_settings`). Dates are passed in as `yyyy-mm-dd`
 * strings because that's how Supabase sends `date` columns.
 *
 * Design notes:
 *  - Birth year is NEVER stored in the values returned for coworker feeds.
 *    The caller should read from `profiles_celebrations_public` which
 *    exposes only `dob_month_day` (MM-DD).
 *  - Feb-29 birthdays fall back to Feb-28 in non-leap years so the
 *    celebrant still has a day.
 *  - Anniversaries with `years <= 0` (future hires, same-day hires
 *    before the first year clicks over) are filtered out.
 */

import { toZonedTime, format as formatTz } from "date-fns-tz";

export type CelebrationKind = "birthday" | "anniversary";
export type Language = "en" | "id";

export type Celebrant = {
  id: string;
  fullName: string;
  kind: CelebrationKind;
  /** ISO `yyyy-mm-dd` of this occurrence in app tz. */
  occursOn: string;
  /** Calendar year of this occurrence (used for event_year message key). */
  eventYear: number;
  /** Anniversary only; integer > 0. */
  years?: number;
  /** True when `years` is one of the milestone years (anniversary). */
  isMilestoneYear?: boolean;
};

export type CelebrationRow = {
  id: string;
  full_name: string;
  /** Optional admin-set nickname. When present, shown in place of
   *  `full_name` everywhere in the celebrations UI. */
  nickname: string | null;
  dob_month_day: string | null;
  first_day_of_work: string | null;
};

/**
 * Return the name to show in the UI for a profile: the admin-set
 * nickname when present and non-empty, otherwise the full name.
 */
export function pickDisplayName(
  fullName: string | null | undefined,
  nickname: string | null | undefined
): string {
  const n = nickname?.trim();
  if (n) return n;
  return (fullName ?? "").trim();
}

export const ANNIVERSARY_MILESTONES: readonly number[] = [1, 3, 5, 10, 15, 20, 25];

export function isAnniversaryMilestone(years: number): boolean {
  return ANNIVERSARY_MILESTONES.includes(years);
}

/**
 * Convert a `Date` to the `yyyy-mm-dd` string in the given timezone.
 * Using date-fns-tz so DST transitions are handled correctly.
 */
export function zonedDateString(d: Date, tz: string): string {
  const z = toZonedTime(d, tz);
  return formatTz(z, "yyyy-MM-dd", { timeZone: tz });
}

function zonedParts(d: Date, tz: string): { y: number; m: number; d: number } {
  const iso = zonedDateString(d, tz);
  const [y, m, day] = iso.split("-").map(Number);
  return { y, m, d: day };
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Resolve a MM-DD (as stored on a profile's DOB) to the specific
 * `yyyy-mm-dd` for a given calendar year. Feb-29 → Feb-28 in non-leap.
 */
export function resolveBirthdayThisYear(mmdd: string, year: number): string {
  const [m, d] = mmdd.split("-").map(Number);
  if (m === 2 && d === 29 && !isLeapYear(year)) {
    return `${year}-02-28`;
  }
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Years since `firstDay`, floored. 0 or negative → filtered out upstream.
 * Only the month+day of `firstDay` matter for when the anniversary clicks
 * over each year.
 */
export function computeAnniversaryYears(
  firstDayIso: string,
  today: Date,
  tz: string
): number {
  const [fy, fm, fd] = firstDayIso.split("-").map(Number);
  const t = zonedParts(today, tz);
  let years = t.y - fy;
  // Has this year's anniversary already passed?
  if (t.m < fm || (t.m === fm && t.d < fd)) years -= 1;
  return years;
}

/**
 * Compare two ISO dates in the same tz (both `yyyy-mm-dd`) for ordering.
 */
function dayDiff(aIso: string, bIso: string): number {
  // Both are already date-only in the same zone; Date arithmetic at UTC
  // midnight gives a stable integer day count.
  const a = Date.UTC(
    Number(aIso.slice(0, 4)),
    Number(aIso.slice(5, 7)) - 1,
    Number(aIso.slice(8, 10))
  );
  const b = Date.UTC(
    Number(bIso.slice(0, 4)),
    Number(bIso.slice(5, 7)) - 1,
    Number(bIso.slice(8, 10))
  );
  return Math.round((a - b) / 86_400_000);
}

/**
 * Build the list of celebrants whose event falls in the window
 * `[today, today + windowDays - 1]` inclusive (in app tz). Used for the
 * feed's "today" + "upcoming" sections.
 */
export function getCelebrantsInWindow(
  rows: CelebrationRow[],
  today: Date,
  tz: string,
  windowDays: number
): Celebrant[] {
  const todayIso = zonedDateString(today, tz);
  const { y: thisYear } = zonedParts(today, tz);
  const out: Celebrant[] = [];

  for (const row of rows) {
    // Birthdays: check this year's occurrence, and if it's already past,
    // also look at next year's occurrence so a Jan-2 birthday seen on
    // Dec-29 still surfaces in upcoming.
    if (row.dob_month_day) {
      for (const yr of [thisYear, thisYear + 1]) {
        const iso = resolveBirthdayThisYear(row.dob_month_day, yr);
        const diff = dayDiff(iso, todayIso);
        if (diff >= 0 && diff < windowDays) {
          out.push({
            id: row.id,
            fullName: pickDisplayName(row.full_name, row.nickname),
            kind: "birthday",
            occursOn: iso,
            eventYear: yr,
          });
          break;
        }
      }
    }

    // Anniversaries: same idea, but years must be > 0.
    if (row.first_day_of_work) {
      const [fy, fm, fd] = row.first_day_of_work.split("-").map(Number);
      for (const yr of [thisYear, thisYear + 1]) {
        const iso = `${yr}-${String(fm).padStart(2, "0")}-${String(fd).padStart(2, "0")}`;
        const diff = dayDiff(iso, todayIso);
        if (diff >= 0 && diff < windowDays) {
          const years = yr - fy;
          if (years <= 0) break;
          out.push({
            id: row.id,
            fullName: pickDisplayName(row.full_name, row.nickname),
            kind: "anniversary",
            occursOn: iso,
            eventYear: yr,
            years,
            isMilestoneYear: isAnniversaryMilestone(years),
          });
          break;
        }
      }
    }
  }

  // Sort: soonest first, then by kind (birthday before anniversary), then name.
  out.sort((a, b) => {
    if (a.occursOn !== b.occursOn) return a.occursOn < b.occursOn ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "birthday" ? -1 : 1;
    return a.fullName.localeCompare(b.fullName);
  });

  return out;
}

/**
 * Compute the viewer's own celebration for today, if any. Uses the
 * viewer's full profile (we know DOB year here because it's their own),
 * but the returned object doesn't include birth year so the hero UI
 * stays purely celebratory.
 */
export function getSelfCelebrationToday(args: {
  id: string;
  fullName: string;
  nickname?: string | null;
  dateOfBirth: string | null;
  firstDayOfWork: string | null;
  today: Date;
  tz: string;
}): Celebrant | null {
  const { id, fullName, nickname, dateOfBirth, firstDayOfWork, today, tz } = args;
  const displayName = pickDisplayName(fullName, nickname);
  const t = zonedParts(today, tz);
  const todayIso = zonedDateString(today, tz);

  if (dateOfBirth) {
    const [, bm, bd] = dateOfBirth.split("-").map(Number);
    const mmdd = `${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`;
    const iso = resolveBirthdayThisYear(mmdd, t.y);
    if (iso === todayIso) {
      return {
        id,
        fullName: displayName,
        kind: "birthday",
        occursOn: iso,
        eventYear: t.y,
      };
    }
  }

  if (firstDayOfWork) {
    const years = computeAnniversaryYears(firstDayOfWork, today, tz);
    const [, fm, fd] = firstDayOfWork.split("-").map(Number);
    const iso = `${t.y}-${String(fm).padStart(2, "0")}-${String(fd).padStart(2, "0")}`;
    if (iso === todayIso && years > 0) {
      return {
        id,
        fullName: displayName,
        kind: "anniversary",
        occursOn: iso,
        eventYear: t.y,
        years,
        isMilestoneYear: isAnniversaryMilestone(years),
      };
    }
  }

  return null;
}

/**
 * Whether a given celebration is in its posting window (±1 day around
 * the event). Keeps the feed active while greetings feel timely and
 * prevents graveyard posts weeks later.
 */
export function isWithinActiveWindow(occursOn: string, today: Date, tz: string): boolean {
  const todayIso = zonedDateString(today, tz);
  const diff = dayDiff(occursOn, todayIso);
  return diff >= -1 && diff <= 1;
}

// ------------------------------------------------------------------
// WhatsApp message builders — kept next to the logic that triggers them
// so copy and thresholds evolve together.
// ------------------------------------------------------------------

export function buildBirthdayWaMessage(lang: Language, name: string): string {
  const first = name.split(" ")[0] ?? name;
  if (lang === "en") {
    return `🎂 Happy birthday, ${first}! Wishing you a wonderful year ahead. — Tim Zota`;
  }
  return `🎂 Selamat ulang tahun, ${first}! Semoga tahun ini penuh hal baik. — Tim Zota`;
}

export function buildAnniversaryWaMessage(
  lang: Language,
  name: string,
  years: number,
  isMilestone: boolean
): string {
  const first = name.split(" ")[0] ?? name;
  if (isMilestone) {
    if (lang === "en") {
      return `🏆 ${years} years at Zota, ${first} — that's a big milestone! Thank you for everything.`;
    }
    return `🏆 ${years} tahun di Zota, ${first} — itu milestone besar! Terima kasih banyak.`;
  }
  if (lang === "en") {
    return `🎉 Happy ${years}-year anniversary at Zota, ${first}! Thanks for the journey so far.`;
  }
  return `🎉 Selamat ${years} tahun di Zota, ${first}! Terima kasih untuk kontribusimu.`;
}

/**
 * Short notification sent to the celebrant when someone posts a new
 * greeting on their celebration. Includes a trimmed body preview so
 * they don't have to open the app just to feel the warmth.
 */
export function buildGreetingNotificationMessage(
  lang: Language,
  celebrantName: string,
  authorName: string,
  body: string,
  eventKind: CelebrationKind
): string {
  const first = (celebrantName.split(" ")[0] ?? celebrantName).trim() || celebrantName;
  const preview = body.trim().length > 140
    ? body.trim().slice(0, 140).replace(/\s+\S*$/, "") + "…"
    : body.trim();
  const author = authorName.trim() || "Seseorang";
  if (lang === "en") {
    const eventWord = eventKind === "birthday" ? "birthday" : "anniversary";
    return `💌 ${first}, you've got a new ${eventWord} message from ${author}:\n\n"${preview}"\n\nOpen Zota to reply ✨`;
  }
  const eventWord = eventKind === "birthday" ? "ulang tahun" : "anniversary";
  return `💌 ${first}, ada ucapan ${eventWord} baru dari ${author}:\n\n"${preview}"\n\nBuka Zota buat balas ✨`;
}

