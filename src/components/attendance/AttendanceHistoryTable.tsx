import { MapPin, XCircle } from "lucide-react";
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

type LogWithOt = AttendanceLog & {
  overtime_admin_note?: string | null;
};

interface AttendanceHistoryTableProps {
  logs: LogWithOt[];
  timezone?: string;
  workEndTime?: string;
  isFlexibleSchedule?: boolean;
}

const OT_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#fff7ed", color: "#b45309" },
  approved: { bg: "#f0fdf4", color: "#15803d" },
  rejected: { bg: "#fef2f2", color: "#b91c1c" },
};

export function AttendanceHistoryTable({ logs, timezone, workEndTime, isFlexibleSchedule }: AttendanceHistoryTableProps) {
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
    <div className="rounded-xl border overflow-x-auto max-w-full">
      <Table>
        <TableHeader>
          <TableRow className="bg-[#f5f5f7]">
            <TableHead className="text-xs font-semibold uppercase tracking-wide">Date</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide">Check-in</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide">Check-out</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide">Status</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide w-[180px] max-w-[180px]">Overtime</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide">Location</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const otStyle = log.overtime_status
              ? OT_STATUS_STYLES[log.overtime_status] ?? OT_STATUS_STYLES.pending
              : null;

            return (
              <TableRow key={log.id} className="hover:bg-[#f5f5f7]/50">
                <TableCell className="font-medium">
                  {formatLocalDate(log.date)}
                </TableCell>
                <TableCell>{formatTime(log.checked_in_at, timezone)}</TableCell>
                <TableCell>
                  {log.checked_out_at ? (
                    <div>
                      <span>{formatTime(log.checked_out_at, timezone)}</span>
                      {log.late_checkout_reason && (
                        <p className="text-xs text-muted-foreground mt-0.5" title={log.late_checkout_reason}>
                          Late: {log.late_checkout_reason.length > 30 ? log.late_checkout_reason.slice(0, 30) + "…" : log.late_checkout_reason}
                        </p>
                      )}
                    </div>
                  ) : (
                    <LateCheckoutDialog
                      attendanceLogId={log.id}
                      date={log.date}
                      checkedInAt={log.checked_in_at}
                      workEndTime={workEndTime}
                      isFlexibleSchedule={isFlexibleSchedule}
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
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "#fff7ed", color: "#b45309" }}>
                            📎 Proof pending review
                          </span>
                        )}
                        {log.late_proof_status === "approved" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "#f0fdf4", color: "#15803d" }}>
                            📎 Excuse accepted
                          </span>
                        )}
                        {log.late_proof_status === "rejected" && (
                          <div className="space-y-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "#fef2f2", color: "#b91c1c" }}>
                              📎 Excuse rejected
                            </span>
                            {log.late_proof_admin_note && (
                              <p className="text-[10px] text-red-600 leading-tight break-words pl-1">
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
                <TableCell className="w-[180px] max-w-[180px] overflow-hidden">
                  {log.is_overtime && log.overtime_minutes > 0 && otStyle ? (
                    <div className="space-y-1">
                      <Badge
                        className="text-xs px-2"
                        style={{ background: otStyle.bg, color: otStyle.color, border: "none" }}
                      >
                        {formatMinutesHuman(log.overtime_minutes)} ({log.overtime_status})
                      </Badge>
                      {log.overtime_status === "rejected" && log.overtime_admin_note && (
                        <div className="flex items-start gap-1 w-full">
                          <XCircle size={10} className="mt-0.5 shrink-0" style={{ color: "#b91c1c" }} />
                          <p className="text-xs leading-tight break-words" style={{ color: "#b91c1c" }}>
                            {log.overtime_admin_note}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : log.overtime_status === "rejected" && log.overtime_admin_note ? (
                    <div className="space-y-1">
                      <Badge
                        className="text-xs px-2"
                        style={{ background: "#fef2f2", color: "#ff3b30", border: "none" }}
                      >
                        Rejected
                      </Badge>
                      <div className="flex items-start gap-1 max-w-[180px]">
                        <XCircle size={10} className="mt-0.5 shrink-0" style={{ color: "#b91c1c" }} />
                        <p className="text-xs leading-tight" style={{ color: "#b91c1c" }}>
                          {log.overtime_admin_note}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {log.latitude ? (
                    <a
                      href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs"
                      style={{ color: "var(--primary)" }}
                    >
                      <MapPin size={12} />
                      View
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
