"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, CheckCircle, XCircle, MessageSquare } from "lucide-react";
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
    admin_note?: string | null;
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
  pending: { bg: "#fff7ed", color: "#b45309", label: "Pending" },
  approved: { bg: "#f0fdf4", color: "#15803d", label: "Approved" },
  rejected: { bg: "#fef2f2", color: "#b91c1c", label: "Rejected" },
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

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectMessage, setRejectMessage] = useState("");

  function handleOvertimeAction(requestId: string, decision: "approved" | "rejected", adminNote?: string) {
    startTransition(async () => {
      const result = await reviewOvertimeRequest(requestId, decision, adminNote);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(decision === "approved" ? "Overtime approved" : "Overtime rejected");
        setRejectingId(null);
        setRejectMessage("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {count} record{count !== 1 ? "s" : ""} · page {page} of {totalPages}
      </p>

      <div className="rounded-xl border overflow-x-auto bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f5f5f7]">
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Employee</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Date</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Check-in</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Check-out</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide w-[200px] max-w-[200px]">Overtime</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isOpen = !row.checked_out_at;
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
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={row.status} lateMinutes={row.late_minutes} />
                      {row.late_proof_url && (
                        <span className="text-xs text-blue-500">📎</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="w-[200px] max-w-[200px] overflow-hidden">
                    {row.is_overtime && row.overtime_minutes > 0 && otStyle ? (
                      <div className="space-y-1.5">
                        <Badge
                          className="text-xs px-2"
                          style={{ background: otStyle.bg, color: otStyle.color, border: "none" }}
                        >
                          {formatMinutesHuman(row.overtime_minutes)} ({otStyle.label})
                        </Badge>

                        {/* Employee's reason */}
                        {otRequest?.reason && (
                          <div className="flex items-start gap-1 w-full">
                            <MessageSquare size={10} className="mt-0.5 shrink-0 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground leading-tight break-words">
                              {otRequest.reason}
                            </p>
                          </div>
                        )}

                        {/* Pending: show approve/reject actions */}
                        {row.overtime_status === "pending" && otRequest && (
                          <>
                            {rejectingId === otRequest.id ? (
                              <div className="space-y-1 w-full">
                                <textarea
                                  className="w-full text-[11px] border rounded-md px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-red-300"
                                  rows={2}
                                  placeholder="Rejection reason (required)…"
                                  value={rejectMessage}
                                  onChange={(e) => setRejectMessage(e.target.value)}
                                  autoFocus
                                />
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => {
                                      if (!rejectMessage.trim()) {
                                        toast.error("Please provide a rejection reason");
                                        return;
                                      }
                                      handleOvertimeAction(otRequest.id, "rejected", rejectMessage.trim());
                                    }}
                                    disabled={isPending}
                                    style={{ color: "#b91c1c" }}
                                  >
                                    Confirm Reject
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-1.5 text-xs text-muted-foreground"
                                    onClick={() => {
                                      setRejectingId(null);
                                      setRejectMessage("");
                                    }}
                                    disabled={isPending}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleOvertimeAction(otRequest.id, "approved")}
                                  disabled={isPending}
                                  style={{ color: "#15803d" }}
                                >
                                  <CheckCircle size={10} className="mr-0.5" />
                                  Approve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setRejectingId(otRequest.id)}
                                  disabled={isPending}
                                  style={{ color: "#b91c1c" }}
                                >
                                  <XCircle size={10} className="mr-0.5" />
                                  Reject
                                </Button>
                              </div>
                            )}
                          </>
                        )}

                        {/* Admin note for reviewed requests */}
                        {otRequest?.admin_note && row.overtime_status === "rejected" && (
                          <div className="flex items-start gap-1 w-full">
                            <XCircle size={10} className="mt-0.5 shrink-0" style={{ color: "#b91c1c" }} />
                            <p className="text-xs leading-tight break-words" style={{ color: "#b91c1c" }}>
                              {otRequest.admin_note}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : row.overtime_status === "rejected" && otRequest?.admin_note ? (
                      <div className="space-y-1">
                        <Badge
                          className="text-xs px-2"
                          style={{ background: "#fef2f2", color: "#ff3b30", border: "none" }}
                        >
                          Rejected
                        </Badge>
                        <div className="flex items-start gap-1 w-full">
                          <XCircle size={10} className="mt-0.5 shrink-0" style={{ color: "#b91c1c" }} />
                          <p className="text-xs leading-tight" style={{ color: "#b91c1c" }}>
                            {otRequest.admin_note}
                          </p>
                        </div>
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
