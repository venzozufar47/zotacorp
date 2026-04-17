"use client";

import { Clock, MapPin, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttendanceLog } from "@/lib/supabase/types";
import {
  formatTime,
  getDurationHours,
  formatMinutesHuman,
} from "@/lib/utils/date";
import { StatusBadge } from "./StatusBadge";
import { EarlyArrivalPill } from "./EarlyArrivalPill";
import { StreakChip } from "./StreakChip";
import type { StreakSnapshot } from "@/lib/utils/streak";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface AttendanceStatusCardProps {
  log: AttendanceLog | null;
  timezone?: string;
  overtimeAdminNote?: string | null;
  /** Optional streak snapshot; when present renders a chip above the status row. */
  streak?: StreakSnapshot | null;
}

export function AttendanceStatusCard({ log, timezone, overtimeAdminNote, streak }: AttendanceStatusCardProps) {
  const { t } = useTranslation();
  if (!log) return null;

  const isOpen = !log.checked_out_at;
  const totalMin = log.checked_out_at
    ? Math.floor(
        (new Date(log.checked_out_at).getTime() -
          new Date(log.checked_in_at).getTime()) /
          60_000
      )
    : 0;
  const workedH = Math.floor(totalMin / 60);
  const workedM = totalMin % 60;

  const overtimeStatus: "approved" | "rejected" | "pending" =
    log.overtime_status === "approved"
      ? "approved"
      : log.overtime_status === "rejected"
      ? "rejected"
      : "pending";
  const overtimeLabel =
    overtimeStatus === "approved"
      ? t.attendanceStatus.overtimeApproved
      : overtimeStatus === "rejected"
      ? t.attendanceStatus.overtimeRejected
      : t.attendanceStatus.overtimePending;

  return (
    <div className="rounded-2xl border-2 border-foreground bg-accent shadow-hard-sm p-4">
      {streak && (
        <div className="mb-3">
          <StreakChip snapshot={streak} />
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="eyebrow text-primary">
              {t.attendanceStatus.today}
            </p>
            <StatusBadge status={log.status} lateMinutes={log.late_minutes} />
            {log.is_early_arrival && <EarlyArrivalPill />}
            {log.late_proof_url && log.late_proof_status && (
              <>
                <span
                  className={cn(
                    "text-[10px] font-display font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-2 border-foreground",
                    log.late_proof_status === "pending" && "bg-tertiary text-foreground",
                    log.late_proof_status === "approved" && "bg-quaternary text-foreground",
                    log.late_proof_status === "rejected" && "bg-destructive text-white"
                  )}
                >
                  {log.late_proof_status === "pending"
                    ? `📎 ${t.attendanceStatus.proofPending}`
                    : log.late_proof_status === "approved"
                    ? `📎 ${t.attendanceStatus.excuseAccepted}`
                    : `📎 ${t.attendanceStatus.excuseRejected}`}
                </span>
                {log.late_proof_status === "rejected" && log.late_proof_admin_note && (
                  <p className="text-[10px] text-destructive leading-tight break-words basis-full font-medium">
                    {log.late_proof_admin_note}
                  </p>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="inline-flex items-center justify-center size-6 rounded-full border-2 border-foreground bg-card">
                <Clock size={12} strokeWidth={2.5} className="text-primary" />
              </span>
              <span className="font-display font-bold text-foreground">
                {formatTime(log.checked_in_at, timezone)}
              </span>
              {log.checked_out_at && (
                <>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-display font-bold text-foreground">
                    {formatTime(log.checked_out_at, timezone)}
                  </span>
                </>
              )}
            </div>
          </div>
          {log.checked_out_at && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground font-medium">
                {getDurationHours(log.checked_in_at, log.checked_out_at)} {t.attendanceStatus.worked}
                {log.is_overtime && log.overtime_minutes > 0 && (
                  <span
                    className={cn(
                      "ml-1 font-bold",
                      overtimeStatus === "approved" && "text-quaternary",
                      overtimeStatus === "rejected" && "text-destructive",
                      overtimeStatus === "pending" && "text-primary"
                    )}
                  >
                    · {formatMinutesHuman(log.overtime_minutes, t.units)} {overtimeLabel}
                  </span>
                )}
              </p>
              {overtimeStatus === "rejected" && overtimeAdminNote && (
                <div className="flex items-start gap-1 max-w-[220px]">
                  <XCircle size={10} className="mt-0.5 shrink-0 text-destructive" />
                  <p className="text-xs leading-tight break-words text-destructive font-medium">
                    {overtimeAdminNote}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="text-right shrink-0">
          {isOpen ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border-2 border-foreground bg-tertiary text-foreground">
              <span className="size-1.5 rounded-full bg-foreground animate-pulse" />
              {t.attendanceStatus.inProgress}
            </span>
          ) : (
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border-2 border-foreground bg-quaternary text-foreground">
                <span className="size-1.5 rounded-full bg-foreground" />
                {t.attendanceStatus.complete}
              </span>
              <p className="font-display text-xl font-extrabold mt-1.5 text-primary">
                {workedH === 0
                  ? `${workedM}${t.units.minuteShort}`
                  : workedM === 0
                  ? `${workedH}${t.units.hourShort}`
                  : `${workedH}${t.units.hourShort} ${workedM}${t.units.minuteShort}`}
              </p>
            </div>
          )}
          {log.latitude && (
            <a
              href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs mt-1.5 justify-end text-primary font-bold hover:underline"
            >
              <MapPin size={12} strokeWidth={2.5} />
              {t.attendanceStatus.viewLocation}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
