/**
 * Lightweight server-side input bounds for finance/investor writes.
 *
 * Server actions are publicly invokable, so client-supplied numbers must
 * be range-checked before they hit the DB — a NaN, negative, or absurd
 * value would otherwise corrupt PnL / payout / metric math. These mirror
 * the DB column limits (NUMERIC(16,2) ≈ 1e14 ceiling) as a backstop.
 */

/** Upper bound for any IDR amount column (NUMERIC(16,2) practical max). */
export const MAX_IDR = 100_000_000_000_000; // 1e14 (~100 triliun)

/** Finite, non-negative, within the IDR column ceiling. */
export function isValidMoney(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_IDR;
}

/** Finite percentage in [0, 100]. */
export function isValidPct(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
}

/** Strict `YYYY-MM-DD` shape check (does not validate calendar bounds). */
export function isValidYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Clamp an optional percentage to [0, 100]; null/NaN → null. */
export function clampPct(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

/** Clamp an optional integer count to ≥ 0; null/NaN → null. */
export function clampCount(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}
