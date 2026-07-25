/**
 * Who cleans what, at a branch, today.
 *
 * A branch owns N checklists ("duty slots"). It does NOT own people: the
 * performers are whoever from the branch's pool actually checked in there that
 * day (see migration 109). This module turns "the pool members present today"
 * into "which slot each of them must do".
 *
 * Rules encoded here:
 *   * Deterministic rank. Callers pass presentUserIds already ordered by
 *     (pool.sort_order, user_id) — NOT by check-in time — so a late arrival can
 *     never reshuffle a checklist someone has already started.
 *   * Daily swap. The slot each rank gets is offset by the branch's rotation
 *     index for the day, so two people alternate checklists day to day instead
 *     of one of them always drawing the toilets.
 *   * No pile-on. Ranks >= slotCount get no duty at all: a day with 5 people
 *     present is still N checklists of work, not 5.
 *
 * The day offset is delegated to dutyOwnerIndex() from cleaning-rotation.ts, so
 * branch duty inherits the exact weekday-bitmask + skip-holidays semantics the
 * per-person rotation already uses (and returns "nobody on duty" the same way).
 *
 * Pure — safe to import from both server actions and client previews.
 */
import { dutyOwnerIndex } from "@/lib/utils/cleaning-rotation";
import { isWorkdayFor } from "@/lib/utils/workdays";

export interface BranchDutyOptions {
  /** Date being resolved, YYYY-MM-DD. */
  dateYmd: string;
  /** Fixed date the branch's rotation counts from. */
  anchorYmd: string;
  /** Weekday of dateYmd, 0=Sun..6=Sat (Jakarta). */
  dow: number;
  /** Bitmask of days the duty runs, same convention as profiles.workdays. */
  weekdays: number;
  /** How many checklists the branch has (duty slots). */
  slotCount: number;
  /**
   * Pool members who checked in at this branch today, pre-sorted by
   * (sort_order, user_id). Order must be stable across the day.
   */
  presentUserIds: readonly string[];
  holidays?: ReadonlySet<string>;
  skipHolidays?: boolean;
}

/**
 * The day counter, reduced modulo `cycle`. Returns -1 when nobody is on duty
 * (not a scheduled weekday, a skipped holiday, or before the anchor).
 *
 * Every caller derives its offset from the same underlying day index, just
 * reduced by a different modulus — that is what keeps the slot swap and the
 * who-sits-out rotation in step with each other.
 */
export function branchDutyShift(o: BranchDutyOptions, cycle: number): number {
  if (o.slotCount <= 0 || cycle <= 0) return -1;
  return dutyOwnerIndex({
    dateYmd: o.dateYmd,
    anchorYmd: o.anchorYmd,
    dow: o.dow,
    weekdays: o.weekdays,
    mode: "daily",
    memberCount: cycle,
    holidays: o.holidays,
    skipHolidays: o.skipHolidays,
  });
}

/**
 * user_id → duty slot index for today. Users absent from the map have no duty.
 *
 * Two regimes, because "fair" means different things either side of the line:
 *
 *   present <= slots — everyone works. The slot each person draws is offset by
 *     the day, so a pair alternates daily and a lone person still covers both
 *     halves across two days instead of forever cleaning the same rooms.
 *
 *   present > slots — somebody sits out, so the sit-out has to rotate or the
 *     person who happens to sort last is permanently spared. Ranks are shifted
 *     into "seats" by the day counter; only the first `slotCount` seats work,
 *     and the seat number IS the slot. Over `present` days everyone cycles
 *     through every slot and the rest day exactly once.
 */
export function resolveBranchDuty(o: BranchDutyOptions): Map<string, number> {
  const out = new Map<string, number>();
  const present = o.presentUserIds.length;
  if (o.slotCount <= 0 || present === 0) return out;

  // Uses slotCount as the cycle purely as the "is anyone on duty at all?" probe.
  if (branchDutyShift(o, o.slotCount) < 0) return out;

  if (present <= o.slotCount) {
    const shift = branchDutyShift(o, o.slotCount);
    o.presentUserIds.forEach((userId, rank) => {
      out.set(userId, (rank + shift) % o.slotCount);
    });
    return out;
  }

  const shift = branchDutyShift(o, present);
  o.presentUserIds.forEach((userId, rank) => {
    const seat = ((rank - shift) % present + present) % present;
    if (seat < o.slotCount) out.set(userId, seat);
  });
  return out;
}

/** This user's slot for today, or -1 when they have no branch duty. */
export function branchDutySlotFor(
  userId: string,
  o: BranchDutyOptions
): number {
  const slot = resolveBranchDuty(o).get(userId);
  return slot === undefined ? -1 : slot;
}

export interface BranchDutyPreviewDay {
  ymd: string;
  dow: number;
  /** rank → slot for that day, or null when nobody is on duty. */
  slotByRank: number[] | null;
  holiday: string | null;
}

/**
 * The next `count` scheduled days and which slot each RANK draws — for the
 * admin preview ("besok Ika dapat Lantai 1, Sukma Lantai 2"). Ranks are shown
 * rather than names because the actual people are only known once they check in.
 *
 * Shows the common case where exactly `slotCount` people turn up. On days with
 * more people present the sit-out rotation kicks in and the real mapping is
 * whatever resolveBranchDuty() computes.
 */
export function buildBranchDutyPreview(o: {
  fromYmd: string;
  anchorYmd: string;
  weekdays: number;
  slotCount: number;
  count?: number;
  holidays?: ReadonlyMap<string, string>;
  skipHolidays?: boolean;
}): BranchDutyPreviewDay[] {
  const want = o.count ?? 14;
  const out: BranchDutyPreviewDay[] = [];
  if (o.slotCount <= 0) return out;
  const holiSet = o.holidays ? new Set(o.holidays.keys()) : undefined;
  const DAY_MS = 24 * 60 * 60 * 1000;
  let cursor = Date.parse(o.fromYmd + "T00:00:00Z");
  let guard = 0;
  while (out.length < want && guard < 400) {
    const date = new Date(cursor);
    const ymd = date.toISOString().slice(0, 10);
    const dow = date.getUTCDay();
    const shift = branchDutyShift(
      {
        dateYmd: ymd,
        anchorYmd: o.anchorYmd,
        dow,
        weekdays: o.weekdays,
        slotCount: o.slotCount,
        presentUserIds: [],
        holidays: holiSet,
        skipHolidays: o.skipHolidays,
      },
      o.slotCount
    );
    // Only surface days the duty actually runs on; unscheduled weekdays are
    // noise. A scheduled day that falls on a skipped holiday still shows up,
    // labelled, so the admin can see why the sequence pauses.
    if (isWorkdayFor(o.weekdays, dow)) {
      out.push({
        ymd,
        dow,
        holiday: o.holidays?.has(ymd) && o.skipHolidays
          ? o.holidays.get(ymd) ?? "Libur"
          : null,
        slotByRank:
          shift < 0
            ? null
            : Array.from(
                { length: o.slotCount },
                (_, rank) => (rank + shift) % o.slotCount
              ),
      });
    }
    cursor += DAY_MS;
    guard++;
  }
  return out;
}
