/** Indonesian short month labels. Index 0 = Januari … 11 = Desember. */
export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

/**
 * Canonical human date format: "2025-12-01" → "01 Des 2025".
 * Date-only, zero-padded day, Indonesian short month (reuses MONTH_NAMES).
 *
 * Parses the ISO prefix directly instead of `new Date()` so it never
 * shifts across timezones. Also accepts a full ISO timestamp (uses its
 * date part). Returns "—" for empty/null and passes non-ISO input through
 * unchanged.
 */
export function formatDateID(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const month = MONTH_NAMES[Number(m[2]) - 1] ?? m[2];
  return `${m[3]} ${month} ${m[1]}`;
}
