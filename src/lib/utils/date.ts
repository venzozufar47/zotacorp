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
 * Format minutes as "X hours Y minutes" or "Y minutes" if < 60.
 */
export function formatMinutesHuman(minutes: number): string {
  if (minutes <= 0) return "0 minutes";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} minute${m !== 1 ? "s" : ""}`;
  if (m === 0) return `${h} hour${h !== 1 ? "s" : ""}`;
  return `${h} hour${h !== 1 ? "s" : ""} ${m} minute${m !== 1 ? "s" : ""}`;
}
