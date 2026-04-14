import { format, formatDuration, intervalToDuration } from "date-fns";
import { toZonedTime, format as formatTz } from "date-fns-tz";

/** Default timezone — used when no settings are available */
const DEFAULT_TZ = "Asia/Jakarta";

export function formatLocalDate(dateStr: string): string {
  return format(new Date(dateStr), "dd MMM yyyy");
}

/**
 * Format a UTC timestamp as HH:mm in the given timezone.
 * Falls back to Asia/Jakarta if no timezone provided.
 */
export function formatTime(dateStr: string, timezone?: string): string {
  const tz = timezone || DEFAULT_TZ;
  const zonedDate = toZonedTime(new Date(dateStr), tz);
  return formatTz(zonedDate, "HH:mm", { timeZone: tz });
}

export function formatDateTime(dateStr: string, timezone?: string): string {
  const tz = timezone || DEFAULT_TZ;
  const zonedDate = toZonedTime(new Date(dateStr), tz);
  return formatTz(zonedDate, "dd MMM yyyy, HH:mm", { timeZone: tz });
}

export function getTodayDateString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function getDurationHours(
  checkIn: string,
  checkOut: string | null
): string {
  if (!checkOut) return "—";
  const duration = intervalToDuration({
    start: new Date(checkIn),
    end: new Date(checkOut),
  });
  return formatDuration(duration, { format: ["hours", "minutes"] }) || "< 1 min";
}

export function getDurationHoursDecimal(
  checkIn: string,
  checkOut: string | null
): number {
  if (!checkOut) return 0;
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.round((ms / 3_600_000) * 10) / 10;
}

/**
 * Unit labels passed in by the caller so this pure util stays language-
 * agnostic. In Indonesian both forms collapse to "jam" / "menit" (no
 * plural inflection), so passing the same string for singular/plural
 * is fine.
 */
export type DurationLabels = {
  zeroMinutes: string;
  hourSingular: string;
  hourPlural: string;
  minuteSingular: string;
  minutePlural: string;
};

const EN_LABELS: DurationLabels = {
  zeroMinutes: "0 minutes",
  hourSingular: "hour",
  hourPlural: "hours",
  minuteSingular: "minute",
  minutePlural: "minutes",
};

/**
 * Format minutes as "X hours Y minutes" or "Y minutes" if < 60.
 * Callers in localized surfaces should pass their dictionary's `units`
 * so output matches the current language.
 */
export function formatMinutesHuman(
  minutes: number,
  labels: DurationLabels = EN_LABELS
): string {
  if (minutes <= 0) return labels.zeroMinutes;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hWord = h === 1 ? labels.hourSingular : labels.hourPlural;
  const mWord = m === 1 ? labels.minuteSingular : labels.minutePlural;
  if (h === 0) return `${m} ${mWord}`;
  if (m === 0) return `${h} ${hWord}`;
  return `${h} ${hWord} ${m} ${mWord}`;
}
