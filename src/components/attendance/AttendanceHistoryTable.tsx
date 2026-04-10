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
  getDurationHours,
  formatMinutesHuman,
} from "@/lib/utils/date";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "./StatusBadge";
import { LateProofUploadDialog } from "./LateProofUploadDialog";

type LogWithOt = AttendanceLog & {
  overtime_admin_note?: string | null;
};

interface AttendanceHistoryTableProps {
  logs: LogWithOt[];
  timezone?: string;
}

const OT_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#fff7ed", color: "#ff9f0a" },
  approved: { bg: "#f0fdf4", color: "#34c759" },
  rejected: { bg: "#fef2f2", color: "#ff3b30" },
};

export function AttendanceHistoryTable({ logs, timezone }: AttendanceHistoryTableProps) {
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
    <div className="rounded-xl border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-[#f5f5f7]">
            <TableHead className="text-xs font-semibold uppercase tracking-wide">Date</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide">Check-in</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide">Check-out</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide">Duration</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide">Status</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide">Overtime</TableHead>
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
                  {log.checked_out_at ? formatTime(log.checked_out_at, timezone) : "—"}
                </TableCell>
                <TableCell>
                  {getDurationHours(log.checked_in_at, log.checked_out_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={log.status} lateMinutes={log.late_minutes} />
                    {log.status === "late" && (
                      <LateProofUploadDialog
                        attendanceLogId={log.id}
                        hasExistingProof={!!log.late_proof_url}
                      />
                    )}
                    {log.status === "late_excused" && (
                      <span className="text-[10px] text-green-600">📎</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {log.is_overtime && log.overtime_minutes > 0 && otStyle ? (
                    <div className="space-y-1">
                      <Badge
                        className="text-[10px] px-2"
                        style={{ background: otStyle.bg, color: otStyle.color, border: "none" }}
                      >
                        {formatMinutesHuman(log.overtime_minutes)} ({log.overtime_status})
                      </Badge>
                      {log.overtime_status === "rejected" && log.overtime_admin_note && (
                        <div className="flex items-start gap-1 max-w-[180px]">
                          <XCircle size={10} className="mt-0.5 shrink-0" style={{ color: "#ff3b30" }} />
                          <p className="text-[10px] leading-tight" style={{ color: "#ff3b30" }}>
                            {log.overtime_admin_note}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : log.overtime_status === "rejected" && log.overtime_admin_note ? (
                    <div className="space-y-1">
                      <Badge
                        className="text-[10px] px-2"
                        style={{ background: "#fef2f2", color: "#ff3b30", border: "none" }}
                      >
                        Rejected
                      </Badge>
                      <div className="flex items-start gap-1 max-w-[180px]">
                        <XCircle size={10} className="mt-0.5 shrink-0" style={{ color: "#ff3b30" }} />
                        <p className="text-[10px] leading-tight" style={{ color: "#ff3b30" }}>
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
