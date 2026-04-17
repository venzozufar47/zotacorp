"use client";

import { XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { AttendanceLog } from "@/lib/supabase/types";
import {
  formatLocalDate,
  formatTime,
  formatMinutesHuman,
} from "@/lib/utils/date";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "./StatusBadge";
import { LateProofUploadDialog } from "./LateProofUploadDialog";
import { LateCheckoutDialog } from "./LateCheckoutDialog";
import { AttendanceNotesCell } from "./AttendanceNotesCell";
import { SelfiePreviewDialog } from "./SelfiePreviewDialog";
import { EarlyArrivalPill } from "./EarlyArrivalPill";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { useState } from "react";

type LogWithOt = AttendanceLog & {
  overtime_admin_note?: string | null;
  /** Extra-work entries logged on the same day, fetched separately and
   *  merged in by the page server component. */
  extra_work?: { kind: string }[];
};

interface AttendanceHistoryTableProps {
  logs: LogWithOt[];
  timezone?: string;
  workEndTime?: string;
  isFlexibleSchedule?: boolean;
}

const OT_BADGE_VARIANT: Record<string, "tertiary" | "quaternary" | "destructive"> = {
  pending: "tertiary",
  approved: "quaternary",
  rejected: "destructive",
};

export function AttendanceHistoryTable({ logs, timezone, workEndTime, isFlexibleSchedule }: AttendanceHistoryTableProps) {
  const { t } = useTranslation();
  const [selfieLog, setSelfieLog] = useState<{ id: string; title: string } | null>(null);

  if (logs.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="No attendance records yet"
        description="Your check-in history will appear here."
      />
    );
  }

  return (
    <div className="max-w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Check-in</TableHead>
            <TableHead>Check-out</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[260px] max-w-[260px]">Overtime</TableHead>
            <TableHead className="w-[280px] max-w-[280px]">{t.attendanceTable.colNotes}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const otVariant = log.overtime_status
              ? OT_BADGE_VARIANT[log.overtime_status] ?? OT_BADGE_VARIANT.pending
              : null;

            return (
              <TableRow key={log.id}>
                <TableCell className="font-display font-bold text-foreground">
                  {formatLocalDate(log.date)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-0.5">
                    {log.selfie_path ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSelfieLog({
                            id: log.id,
                            title: formatLocalDate(log.date),
                          })
                        }
                        className="font-medium tabular-nums text-primary underline-offset-2 hover:underline"
                      >
                        {formatTime(log.checked_in_at, timezone)}
                      </button>
                    ) : (
                      <span className="font-medium tabular-nums">{formatTime(log.checked_in_at, timezone)}</span>
                    )}
                    {log.is_early_arrival && <EarlyArrivalPill />}
                  </div>
                </TableCell>
                <TableCell>
                  {log.checked_out_at ? (
                    <span className="font-medium tabular-nums">{formatTime(log.checked_out_at, timezone)}</span>
                  ) : (
                    <LateCheckoutDialog
                      attendanceLogId={log.id}
                      date={log.date}
                      checkedInAt={log.checked_in_at}
                      workEndTime={workEndTime}
                      isFlexibleSchedule={isFlexibleSchedule}
                      timezone={timezone}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <StatusBadge status={log.status} lateMinutes={log.late_minutes} />
                    </div>
                    {log.status === "late" && !log.late_proof_url && (
                      <LateProofUploadDialog
                        attendanceLogId={log.id}
                        hasExistingProof={false}
                      />
                    )}
                    {log.late_proof_url && (
                      <div>
                        {log.late_proof_status === "pending" && (
                          <Badge variant="tertiary" className="text-[10px]">
                            📎 Proof pending
                          </Badge>
                        )}
                        {log.late_proof_status === "approved" && (
                          <Badge variant="quaternary" className="text-[10px]">
                            📎 Excuse accepted
                          </Badge>
                        )}
                        {log.late_proof_status === "rejected" && (
                          <div className="space-y-0.5">
                            <Badge variant="destructive" className="text-[10px]">
                              📎 Excuse rejected
                            </Badge>
                            {log.late_proof_admin_note && (
                              <p className="text-[10px] text-destructive leading-tight break-words pl-1 font-medium">
                                {log.late_proof_admin_note}
                              </p>
                            )}
                            {log.status === "late" && (
                              <LateProofUploadDialog
                                attendanceLogId={log.id}
                                hasExistingProof={true}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="w-[260px] max-w-[260px] overflow-hidden">
                  {log.is_overtime && log.overtime_minutes > 0 && otVariant ? (
                    <div className="space-y-1">
                      <Badge variant={otVariant} className="text-[10px]">
                        {formatMinutesHuman(log.overtime_minutes)} ({log.overtime_status})
                      </Badge>
                      {log.overtime_status === "rejected" && log.overtime_admin_note && (
                        <div className="flex items-start gap-1 w-full">
                          <XCircle size={10} className="mt-0.5 shrink-0 text-destructive" />
                          <p className="text-xs leading-tight break-words text-destructive font-medium">
                            {log.overtime_admin_note}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : log.overtime_status === "rejected" && log.overtime_admin_note ? (
                    <div className="space-y-1">
                      <Badge variant="destructive" className="text-[10px]">
                        Rejected
                      </Badge>
                      <div className="flex items-start gap-1 max-w-[260px]">
                        <XCircle size={10} className="mt-0.5 shrink-0 text-destructive" />
                        <p className="text-xs leading-tight text-destructive font-medium">
                          {log.overtime_admin_note}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[280px] align-top">
                  <AttendanceNotesCell
                    lateCheckoutReason={log.late_checkout_reason}
                    outsideNote={log.checkout_outside_note}
                    checkoutLat={log.checkout_latitude}
                    checkoutLng={log.checkout_longitude}
                    lateCheckoutPrefix={t.attendanceTable.lateCheckoutPrefix}
                    outsideLabel={t.adminLocations.outsideLocationLabel}
                    viewOnMapsAria={t.adminLocations.viewOnMapsAria}
                    extraWork={log.extra_work}
                    extraWorkKindLabels={t.extraWork.kindLabels}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <SelfiePreviewDialog
        logId={selfieLog?.id ?? null}
        title={selfieLog?.title ?? ""}
        onOpenChange={(o) => !o && setSelfieLog(null)}
      />
    </div>
  );
}
