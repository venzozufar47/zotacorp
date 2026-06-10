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

/** Indonesian full month labels. Index 0 = Januari … 11 = Desember. */
export const MONTH_FULL_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/** Indonesian weekday labels. Index 0 = Minggu … 6 = Sabtu (getUTCDay). */
export const WEEKDAY_NAMES = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
] as const;

/**
 * Long human date: "2026-06-10" → "Senin, 10 Juni 2026".
 * Hari (weekday) + tanggal + bulan penuh + tahun, Bahasa Indonesia.
 *
 * Weekday dihitung via `Date.UTC` + `getUTCDay` (deterministik, tanpa
 * pergeseran timezone). Tanggal tanpa leading-zero ("1 Juni", "10 Juni").
 * "—" untuk kosong; non-ISO dikembalikan apa adanya.
 */
export function formatDateLongID(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const month = MONTH_FULL_NAMES[mo - 1] ?? m[2];
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${weekday}, ${d} ${month} ${y}`;
}
