/**
 * Shared per-day tiered formula for the "Admin Haengbocake" custom
 * cake bonus. Pure, sync — safe to import from any server action or
 * plain data module (no "use server", no IO).
 *
 * Derived from spreadsheet:
 *   IF total < 550_000        → 0
 *   IF 550_000 ≤ total ≤ 700_000 → total × 10%
 *   IF total > 700_000        → 70_000 + (total − 700_000) × 5%
 */
export function dailyTierBonus(total: number): number {
  if (total < 550_000) return 0;
  if (total <= 700_000) return Math.round(total * 0.1);
  return Math.round(70_000 + (total - 700_000) * 0.05);
}
