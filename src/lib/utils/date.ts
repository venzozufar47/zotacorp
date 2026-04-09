import { format, formatDuration, intervalToDuration } from "date-fns";

export function formatLocalDate(dateStr: string): string {
  return format(new Date(dateStr), "dd MMM yyyy");
}

export function formatTime(dateStr: string): string {
  return format(new Date(dateStr), "HH:mm");
}

export function formatDateTime(dateStr: string): string {
  return format(new Date(dateStr), "dd MMM yyyy, HH:mm");
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
