/**
 * On-time streak math.
 *
 * The source of truth is `attendance_logs`: we walk the most recent logs
 * backwards in date order and accumulate while each log's `status` is
 * `"on_time"`. The first `"late"` / `"late_excused"` / `"flexible"` /
 * `"unknown"` log breaks the streak.
 *
 * Design decisions worth flagging:
 *
 *  - **Calendar gaps are ignored, not punished.** An employee scheduled
 *    Mon–Fri whose latest three logs are Mon/Tue/Wed (on-time) has a
 *    streak of 3 regardless of the weekend gap before those. The app
 *    doesn't store a per-employee work-days mask, so we trust the
 *    presence/absence of `attendance_logs` as the schedule signal.
 *
 *  - **Only `on_time` counts.** `late_excused` (admin-approved tardiness)
 *    intentionally does NOT extend the streak — the streak is a pure
 *    punctuality signal, not a performance signal. A sick-day excuse is
 *    fair and shouldn't cost you the streak either, so excused lates are
 *    treated as a reset. We can revisit if employees ask.
 *
 *  - **Milestones fire at first crossing only.** `streak_last_milestone`
 *    on `profiles` tracks the highest milestone already celebrated;
 *    re-opening the dashboard on the same day doesn't refire a WA ping.
 *
 *  - **Empty history → zero streak.** New hires start at 0 and ratchet up
 *    from their first on-time check-in after deploy.
 */

export const STREAK_MILESTONES = [5, 10, 20, 30, 60, 100] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

export type StreakLogInput = {
  /** `YYYY-MM-DD` in the employee's timezone. */
  date: string;
  status: "on_time" | "late" | "late_excused" | "flexible" | "bonus" | "unknown";
  /** Bonus-day logs are non-workday check-ins (or admin-flipped). They
   *  neither extend nor break a streak — filtered out before counting. */
  bonus_day?: boolean;
};

export type StreakSnapshot = {
  /** Consecutive on-time days ending on the most recent log. */
  current: number;
  /** Highest streak ever observed (ratchet). */
  personalBest: number;
  /** The most recent log date (or null for brand-new employees). */
  lastLogDate: string | null;
  /**
   * True when the most recent log is not `on_time` AND the previous run of
   * on-time logs was ≥ 2. Used to show the 💔 "streak ended" chip for the
   * rest of the current day.
   */
  brokenOnLastLog: boolean;
  /**
   * The streak length the previous run reached before it was broken.
   * Only meaningful when `brokenOnLastLog` is true — otherwise 0.
   */
  brokenAt: number;
  /**
   * Nonzero only when `current` just hit a milestone value for the first
   * time (i.e. crossed above `storedLastMilestone`). Used by `checkIn` to
   * decide whether to fire a congratulatory WhatsApp.
   */
  milestoneHitNow: 0 | StreakMilestone;
};

/**
 * Given a chronological slice of the employee's attendance logs and the
 * last-celebrated milestone value, return everything the UI + checkIn
 * action need. Pure and deterministic — no clocks, no network.
 *
 * `logs` can be in any order; this function sorts a local copy.
 */
export function computeStreak(args: {
  logs: StreakLogInput[];
  storedPersonalBest: number;
  storedLastMilestone: number;
}): StreakSnapshot {
  const { storedPersonalBest, storedLastMilestone } = args;
  // Bonus-day check-ins are non-workday entries — they should neither
  // extend nor break a streak, so filter them out before counting.
  const logs = [...args.logs]
    .filter((l) => !l.bonus_day)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  if (logs.length === 0) {
    return {
      current: 0,
      personalBest: storedPersonalBest,
      lastLogDate: null,
      brokenOnLastLog: false,
      brokenAt: 0,
      milestoneHitNow: 0,
    };
  }

  let current = 0;
  for (const log of logs) {
    if (log.status === "on_time") {
      current++;
    } else {
      break;
    }
  }

  // When the streak is broken on the latest log, look back further to
  // find how long the prior run was — that's the number we display in
  // the 💔 chip and the value the personal-best ratchet compares to.
  let brokenAt = 0;
  if (current === 0 && logs.length > 1) {
    for (let i = 1; i < logs.length; i++) {
      if (logs[i].status === "on_time") {
        brokenAt++;
      } else {
        break;
      }
    }
  }

  const effectiveBest = Math.max(storedPersonalBest, current, brokenAt);

  let milestoneHitNow: 0 | StreakMilestone = 0;
  for (const m of STREAK_MILESTONES) {
    if (current >= m && m > storedLastMilestone) {
      // Pick the highest crossed in this computation so someone who
      // joins on day 30 of a good run doesn't get spammed with four WAs
      // — they get one at the highest tier reached.
      milestoneHitNow = m;
    }
  }

  return {
    current,
    personalBest: effectiveBest,
    lastLogDate: logs[0].date,
    brokenOnLastLog: current === 0 && brokenAt >= 2,
    brokenAt: current === 0 ? brokenAt : 0,
    milestoneHitNow,
  };
}

/**
 * WhatsApp message for a milestone crossing. Kept here (not in fonnte.ts)
 * so the copy lives next to the logic that triggers it.
 */
export function buildMilestoneMessage(
  lang: "id" | "en",
  name: string,
  days: number
): string {
  if (lang === "en") {
    return `🎉 Congrats ${name}! You're on a ${days}-day on-time streak. Keep it up!`;
  }
  return `🎉 Selamat ${name}! Kamu udah ${days} hari on-time berturut-turut. Mantap, lanjutkan!`;
}
