"use client";

import { LogIn } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

/**
 * Small amber pill flagging logs whose check-in landed >30 min before the
 * employee's scheduled work_start_time. Used in the today card and both
 * attendance tables so the category is visible at a glance.
 *
 * Same colour family as the outside-location pill so the admin's "out of
 * the ordinary" vocabulary stays consistent.
 */
export function EarlyArrivalPill() {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-display font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-2 border-foreground bg-tertiary text-foreground"
      aria-label={t.attendanceTable.earlyArrivalAria}
      title={t.attendanceTable.earlyArrivalAria}
    >
      <LogIn size={10} strokeWidth={2.5} />
      {t.attendanceTable.earlyArrivalLabel}
    </span>
  );
}
