"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, MessageSquare, Trash2, Paperclip, X, ExternalLink } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { AttendanceNotesCell } from "@/components/attendance/AttendanceNotesCell";
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
import { deleteAttendanceLog, reviewLateProof } from "@/lib/actions/attendance.actions";
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
  late_proof_status: string | null;
  late_proof_admin_note: string | null;
  late_checkout_reason: string | null;
  /** Mandatory note the employee filled in when checking out from outside
   *  all their assigned geofences. null = checkout was inside radius OR
   *  the employee has no location restrictions. */
  checkout_outside_note: string | null;
  checkout_latitude: number | null;
  checkout_longitude: number | null;
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
  const { t } = useTranslation();
  const tl = t.adminLocations;

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<{ url: string; name: string } | null>(null);
  const [loadingProof, setLoadingProof] = useState<string | null>(null);
  const [rejectingProofId, setRejectingProofId] = useState<string | null>(null);
  const [proofRejectMessage, setProofRejectMessage] = useState("");

  function handleLateProofReview(logId: string, decision: "approved" | "rejected", note?: string) {
    startTransition(async () => {
      const result = await reviewLateProof(logId, decision, note);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(decision === "approved" ? "Late excuse accepted" : "Late excuse rejected");
        setRejectingProofId(null);
        setProofRejectMessage("");
        router.refresh();
      }
    });
  }

  async function handleViewProof(logId: string, employeeName: string, date: string) {
    setLoadingProof(logId);
    try {
      const res = await fetch(`/api/attendance/proof?logId=${logId}`);
      const json = await res.json();
      if (json.url) {
        setProofPreview({ url: json.url, name: `${employeeName} — ${formatLocalDate(date)}` });
      } else {
        toast.error(json.error || "Failed to load proof");
      }
    } catch {
      toast.error("Failed to load proof");
    } finally {
      setLoadingProof(null);
    }
  }

  function handleDelete(logId: string) {
    if (deletingId === logId) {
      // Second click — confirm
      startTransition(async () => {
        const result = await deleteAttendanceLog(logId);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Attendance record deleted");
          setDeletingId(null);
          router.refresh();
        }
      });
    } else {
      // First click — ask confirmation
      setDeletingId(logId);
    }
  }

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
    <div className="space-y-3 max-w-full">
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
              <TableHead className="text-xs font-semibold uppercase tracking-wide">{t.attendanceTable.colNotes}</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide w-[60px]"></TableHead>
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
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <StatusBadge status={row.status} lateMinutes={row.late_minutes} />
                      </div>
                      {row.late_proof_url && (
                        <div className="space-y-1">
                          <button
                            className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            onClick={() => handleViewProof(row.id, row.profiles.full_name, row.date)}
                            disabled={loadingProof === row.id}
                            title="View late excuse proof"
                          >
                            <Paperclip size={12} />
                            {loadingProof === row.id ? "Loading…" : "View proof"}
                          </button>
                          {row.late_proof_status === "pending" && (
                            <>
                              {rejectingProofId === row.id ? (
                                <div className="space-y-1 w-full">
                                  <textarea
                                    className="w-full text-[11px] border rounded-md px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-red-300"
                                    rows={2}
                                    placeholder="Rejection reason (required)…"
                                    value={proofRejectMessage}
                                    onChange={(e) => setProofRejectMessage(e.target.value)}
                                    autoFocus
                                  />
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-1.5 text-[11px]"
                                      onClick={() => {
                                        if (!proofRejectMessage.trim()) {
                                          toast.error("Please provide a rejection reason");
                                          return;
                                        }
                                        handleLateProofReview(row.id, "rejected", proofRejectMessage.trim());
                                      }}
                                      disabled={isPending}
                                      style={{ color: "#b91c1c" }}
                                    >
                                      Confirm Reject
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[11px] text-muted-foreground"
                                      onClick={() => { setRejectingProofId(null); setProofRejectMessage(""); }}
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
                                    className="h-6 px-1.5 text-[11px]"
                                    onClick={() => handleLateProofReview(row.id, "approved")}
                                    disabled={isPending}
                                    style={{ color: "#15803d" }}
                                  >
                                    <CheckCircle size={10} className="mr-0.5" />
                                    Accept
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1.5 text-[11px]"
                                    onClick={() => setRejectingProofId(row.id)}
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
                          {row.late_proof_status === "approved" && (
                            <Badge className="text-[10px] px-1.5" style={{ background: "#f0fdf4", color: "#15803d", border: "none" }}>
                              Excuse accepted
                            </Badge>
                          )}
                          {row.late_proof_status === "rejected" && (
                            <div className="space-y-0.5">
                              <Badge className="text-[10px] px-1.5" style={{ background: "#fef2f2", color: "#b91c1c", border: "none" }}>
                                Excuse rejected
                              </Badge>
                              {row.late_proof_admin_note && (
                                <p className="text-[10px] text-red-600 leading-tight break-words">
                                  {row.late_proof_admin_note}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
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
                    <AttendanceNotesCell
                      lateCheckoutReason={row.late_checkout_reason}
                      outsideNote={row.checkout_outside_note}
                      checkoutLat={row.checkout_latitude}
                      checkoutLng={row.checkout_longitude}
                      lateCheckoutPrefix={t.attendanceTable.lateCheckoutPrefix}
                      outsideLabel={tl.outsideLocationLabel}
                      viewOnMapsAria={tl.viewOnMapsAria}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => handleDelete(row.id)}
                      disabled={isPending}
                      title={deletingId === row.id ? "Click again to confirm" : "Delete record"}
                      style={{ color: deletingId === row.id ? "#dc2626" : "var(--muted-foreground)" }}
                    >
                      <Trash2 size={14} />
                    </Button>
                    {deletingId === row.id && (
                      <p className="text-[10px] text-red-600 mt-0.5">Click to confirm</p>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Inline Proof Preview */}
      {proofPreview && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-[#f5f5f7] border-b">
            <p className="text-sm font-medium">{proofPreview.name}</p>
            <div className="flex items-center gap-1">
              <a
                href={proofPreview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-white/80 transition-colors"
                style={{ color: "var(--primary)" }}
                title="Open in new tab"
              >
                <ExternalLink size={12} />
                New tab
              </a>
              <button
                onClick={() => setProofPreview(null)}
                className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/80 transition-colors text-muted-foreground"
                title="Close preview"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center bg-[#fafafa] min-h-[300px] max-h-[70vh]">
            {proofPreview.url.match(/\.(jpe?g|png|gif|webp)/i) || proofPreview.url.includes("image") ? (
              <img
                src={proofPreview.url}
                alt="Late proof"
                className="max-w-full max-h-[70vh] object-contain"
              />
            ) : (
              <iframe
                src={proofPreview.url}
                className="w-full h-[70vh] border-0"
                title="Late proof preview"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

