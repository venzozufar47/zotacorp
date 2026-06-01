/**
 * Cake-bonus role mapping + rates. Plain constants (no "use server") so
 * both the admin UI and the server payslip pipeline can import them.
 *
 * Recipients are identified by `profiles.position` — the bonus follows
 * whoever currently holds the role, not a hardcoded person.
 */

export const CAKE_BONUS_POSITIONS = {
  /** Tasya — company custom-cake bonus from the cashflow engine. */
  adminHaengbocake: "Admin Haengbocake",
  /** Intan — per-cake bonus by diameter for Semarang. */
  decoratorSemarang: "Cake Decorator Semarang",
  /** Zahra — 8% of Pare custom-cake omset. */
  decoratorPare: "Cake Decorator Pare",
} as const;

export type CakeBonusPosition =
  (typeof CAKE_BONUS_POSITIONS)[keyof typeof CAKE_BONUS_POSITIONS];

/** Semarang decorator: per-cake rates by diameter (cm). */
export const SEMARANG_DIAMETER_THRESHOLD_CM = 16;
export const SEMARANG_BONUS_GE_THRESHOLD = 12_000; // diameter >= 16cm
export const SEMARANG_BONUS_LT_THRESHOLD = 7_000; //  diameter <  16cm

/** Pare decorator: share of monthly Pare custom-cake omset. */
export const PARE_OMSET_BONUS_RATE = 0.08;

/** True when this position earns an auto cake bonus. */
export function isCakeBonusPosition(
  position: string | null | undefined
): position is CakeBonusPosition {
  return (
    position === CAKE_BONUS_POSITIONS.adminHaengbocake ||
    position === CAKE_BONUS_POSITIONS.decoratorSemarang ||
    position === CAKE_BONUS_POSITIONS.decoratorPare
  );
}
