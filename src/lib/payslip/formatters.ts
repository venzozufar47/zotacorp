/**
 * Shared formatting helpers for payslip surfaces (employee detail view
 * + PDF). Keeps date/duration formatting consistent across components.
 *
 * Locale handling: most labels are Indonesian by default since the
 * payslip is a formal Indonesian document. UI components that already
 * have `useTranslation` available can pass their `lang` through; PDF
 * always uses "id-ID".
 */

/** Build a Date from a YYYY-MM-DD string in local TZ (avoids UTC drift). */
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

const idLocale = "id-ID";
const enLocale = "en-US";

/** "Sen, 1 Apr" — short weekday + day + month. Used in OT/Late tables. */
export function formatDateShort(iso: string, lang: string = "id"): string {
  return parseIsoDate(iso).toLocaleDateString(
    lang === "id" ? idLocale : enLocale,
    { weekday: "short", day: "numeric", month: "short" }
  );
}

/** "1 April 2026" — long form. Used in headers and PDF metadata. */
export function formatDateLong(iso: string, lang: string = "id"): string {
  return parseIsoDate(iso).toLocaleDateString(
    lang === "id" ? idLocale : enLocale,
    { day: "numeric", month: "long", year: "numeric" }
  );
}

/** "April 2026" — month + year for period labels. */
export function formatMonthYear(
  year: number,
  monthOneIndexed: number,
  lang: string = "id"
): string {
  return new Date(year, monthOneIndexed - 1).toLocaleDateString(
    lang === "id" ? idLocale : enLocale,
    { month: "long", year: "numeric" }
  );
}

/** "1j 30m" / "45m" / "2j". Compact duration string. */
export function formatMins(
  mins: number,
  hLabel: string = "j",
  mLabel: string = "m"
): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}${mLabel}`;
  if (m === 0) return `${h}${hLabel}`;
  return `${h}${hLabel} ${m}${mLabel}`;
}

/** "2026-04" — period key used in the `?p=` URL param and history list. */
export function periodKey(year: number, monthOneIndexed: number): string {
  return `${year}-${String(monthOneIndexed).padStart(2, "0")}`;
}

/** Parse `?p=YYYY-MM` back into a tuple. Returns null on malformed input. */
export function parsePeriodKey(s: string | null | undefined): { year: number; month: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}
