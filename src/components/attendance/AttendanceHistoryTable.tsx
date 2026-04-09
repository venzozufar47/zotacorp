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
                {log.checked_out_at ? (
                  <Badge
                    className="text-[10px] px-2"
                    style={{ background: "#f0fdf4", color: "#34c759", border: "none" }}
                  >
                    Complete
                  </Badge>
                ) : (
                  <Badge
                    className="text-[10px] px-2"
                    style={{ background: "#fff7ed", color: "#ff9f0a", border: "none" }}
                  >
                    Open
                  </Badge>
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
