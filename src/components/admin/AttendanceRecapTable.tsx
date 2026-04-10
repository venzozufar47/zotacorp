"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, CheckCircle, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/attendance/StatusBadge";
import { reviewOvertimeRequest } from "@/lib/actions/overtime.actions";
import { toast } from "sonner";
import {
  formatLocalDate,
  formatTime,
  getDurationHoursDecimal,
  formatMinutesHuman,
} from "@/lib/utils/date";

interface AttendanceRow {
  id: string;
  date: string;
  checked_in_at: string;
  checked_out_at: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  late_minutes: number;
  late_proof_url: string | null;
  is_overtime: boolean;
  overtime_minutes: number;
  overtime_status: string | null;
  profiles: {
    full_name: string;
    email: string;
  };
  overtime_requests?: {
    id: string;
    reason: string;
    status: string;
  }[];
}

interface AttendanceRecapTableProps {
  rows: AttendanceRow[];
  count: number;
  page: number;
  pageSize: number;
  timezone?: string;
}

const OT_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#fff7ed", color: "#ff9f0a", label: "Pending" },
  approved: { bg: "#f0fdf4", color: "#34c759", label: "Approved" },
  rejected: { bg: "#fef2f2", color: "#ff3b30", label: "Rejected" },
};

export function AttendanceRecapTable({
  rows,
  count,
  page,
  pageSize,
  timezone,
}: AttendanceRecapTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title="No records found"
        description="Try adjusting your filters."
      />
    );
  }

  const totalPages = Math.ceil(count / pageSize);

  function handleOvertimeAction(requestId: string, decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await reviewOvertimeRequest(requestId, decision);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(decision === "approved" ? "Overtime approved" : "Overtime rejected");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {count} record{count !== 1 ? "s" : ""} · page {page} of {totalPages}
      </p>

      <div className="rounded-xl border overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f5f5f7]">
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Employee</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Date</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Check-in</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Check-out</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Hours</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Overtime</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isOpen = !row.checked_out_at;
              const hours = getDurationHoursDecimal(
                row.checked_in_at,
                row.checked_out_at
              );

              const otStyle = row.overtime_status
                ? OT_STATUS_STYLES[row.overtime_status] ?? OT_STATUS_STYLES.pending
                : null;

              const otRequest = row.overtime_requests?.[0];

              return (
                <TableRow
                  key={row.id}
                  className={isOpen ? "bg-orange-50/50" : "hover:bg-[#f5f5f7]/40"}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{row.profiles.full_name}</p>
                      <p className="text-xs text-muted-foreground">{row.profiles.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatLocalDate(row.date)}
                  </TableCell>
                  <TableCell className="text-sm">{formatTime(row.checked_in_at, timezone)}</TableCell>
                  <TableCell className="text-sm">
                    {row.checked_out_at ? formatTime(row.checked_out_at, timezone) : "—"}
                  </TableCell>
                  <TableCell className="text-sm font-semibold">
                    {hours > 0 ? `${hours}h` : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={row.status} lateMinutes={row.late_minutes} />
                      {row.late_proof_url && (
                        <span className="text-[10px] text-blue-500">📎</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.is_overtime && row.overtime_minutes > 0 && otStyle ? (
                      <div className="space-y-1">
                        <Badge
                          className="text-[10px] px-2"
                          style={{ background: otStyle.bg, color: otStyle.color, border: "none" }}
                        >
                          {formatMinutesHuman(row.overtime_minutes)} ({otStyle.label})
                        </Badge>
                        {row.overtime_status === "pending" && otRequest && (
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1 text-[10px]"
                              onClick={() => handleOvertimeAction(otRequest.id, "approved")}
                              disabled={isPending}
                              style={{ color: "#34c759" }}
                            >
                              <CheckCircle size={10} className="mr-0.5" />
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1 text-[10px]"
                              onClick={() => handleOvertimeAction(otRequest.id, "rejected")}
                              disabled={isPending}
                              style={{ color: "#ff3b30" }}
                            >
                              <XCircle size={10} className="mr-0.5" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.latitude ? (
                      <a
                        href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`}
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
    </div>
  );
}
