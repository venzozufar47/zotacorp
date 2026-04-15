/**
 * Shared overtime math used by both the client ("should the OT checkbox
 * be visible?") and the server ("how many overtime minutes does this
 * check-out earn?"). Keeping these two decisions in one module prevents
 * the UI from enabling overtime the server then refuses to credit.
 *
 * TZ approach matches the existing `computeCheckInStatus` pattern: shift
 * any UTC `Date` into the target timezone by round-tripping through
 * `toLocaleString("en-US", { timeZone })` and re-parsing. The result is
 * a pseudo-local `Date` — its internal UTC instant is wrong, but
 * comparisons within the same pseudo-local space give the right answer
 * for wall-clock math. Callers must convert their comparands the same
 * way, which is what the attendance actions already do.
 */

const EARLY_THRESHOLD_MS = 30 * 60_000;

/**
 * Parse "HH:MM" or "HH:MM:SS" into [h, m]. Seconds are ignored — work
 * times in this app are only defined to the minute.
 */
function parseHHMM(s: string): [number, number] {
  const [h, m] = s.split(":").map(Number);
  return [h ?? 0, m ?? 0];
}

function toLocalClock(d: Date, timezone: string): Date {
  return new Date(d.toLocaleString("en-US", { timeZone: timezone }));
}

/**
 * True when the check-in landed more than 30 minutes before the day's
 * scheduled work_start_time. Exactly 30 min does NOT qualify (strict >).
 * Flexible schedules are the caller's responsibility to filter out.
 */
export function isEarlyArrival(
  checkedInAt: Date,
  workStartTime: string,
  timezone: string
): boolean {
  const checkInLocal = toLocalClock(checkedInAt, timezone);
  const [sH, sM] = parseHHMM(workStartTime);
  const startLocal = new Date(checkInLocal);
  startLocal.setHours(sH, sM, 0, 0);

  return startLocal.getTime() - checkInLocal.getTime() > EARLY_THRESHOLD_MS;
}

/**
 * Wall-clock moment after which the employee has completed one standard
 * working duration — this is the gate for overtime opt-in.
 *
 *  - Flexible schedule → `null` (no concept of "after the standard day").
 *  - Early arrival → `checked_in_at + (work_end − work_start)`.
 *  - Otherwise → `work_end_time` on the check-in's calendar date.
 *
 * Returned `Date` is pseudo-local (see module docs). Compare against a
 * similarly-shifted `now` / `checkout_at`.
 */
export function getEffectiveWorkEnd(
  checkedInAt: Date,
  workStartTime: string,
  workEndTime: string,
  timezone: string,
  isFlexible: boolean
): Date | null {
  if (isFlexible) return null;

  const checkInLocal = toLocalClock(checkedInAt, timezone);
  const [sH, sM] = parseHHMM(workStartTime);
  const [eH, eM] = parseHHMM(workEndTime);

  const startLocal = new Date(checkInLocal);
  startLocal.setHours(sH, sM, 0, 0);
  const endLocal = new Date(checkInLocal);
  endLocal.setHours(eH, eM, 0, 0);

  const isEarly =
    startLocal.getTime() - checkInLocal.getTime() > EARLY_THRESHOLD_MS;

  if (!isEarly) return endLocal;

  const standardMs = endLocal.getTime() - startLocal.getTime();
  return new Date(checkInLocal.getTime() + standardMs);
}
