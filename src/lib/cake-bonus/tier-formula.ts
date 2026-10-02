/**
 * Shared per-day tiered formula for the "Admin Haengbocake" custom
 * cake bonus. Pure, sync — safe to import from any server action, client
 * component, or plain data module (no "use server", no IO).
 *
 * Derived from spreadsheet:
 *   IF total < 550_000        → 0
 *   IF 550_000 ≤ total ≤ 700_000 → total × 10%
 *   IF total > 700_000        → 70_000 + (total − 700_000) × 5%
 */
export const TIER_MIN = 550_000;
export const TIER_CAP = 700_000;

export type DailyTier = "none" | "flat" | "over";

export function dailyTier(total: number): DailyTier {
  if (total < TIER_MIN) return "none";
  if (total <= TIER_CAP) return "flat";
  return "over";
}

export function dailyTierBonus(total: number): number {
  const tier = dailyTier(total);
  if (tier === "none") return 0;
  if (tier === "flat") return Math.round(total * 0.1);
  return Math.round(70_000 + (total - TIER_CAP) * 0.05);
}
