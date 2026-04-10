import { MapPin } from "lucide-react";
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
} from "@/lib/utils/date";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "./StatusBadge";
import { LateProofUploadDialog } from "./LateProofUploadDialog";

interface AttendanceHistoryTableProps {
  logs: AttendanceLog[];
}

export function AttendanceHistoryTable({ logs }: AttendanceHistoryTableProps) {
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
          {logs.map((log) => (
            <TableRow key={log.id} className="hover:bg-[#f5f5f7]/50">
              <TableCell className="font-medium">
                {formatLocalDate(log.date)}
              </TableCell>
              <TableCell>{formatTime(log.checked_in_at)}</TableCell>
              <TableCell>
                {log.checked_out_at ? formatTime(log.checked_out_at) : "—"}
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
                {log.is_overtime && log.overtime_minutes > 0 ? (
                  <Badge
                    className="text-[10px] px-2"
                    style={{ background: "#eff6ff", color: "#3b82f6", border: "none" }}
                  >
                    {Math.round((log.overtime_minutes / 60) * 10) / 10}h
                  </Badge>
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
