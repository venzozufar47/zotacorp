"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bell, CheckCircle, XCircle, MessageSquare, Pencil, Trash2, Paperclip, X, ExternalLink } from "lucide-react";
import { AdminEditAttendanceDialog } from "./AdminEditAttendanceDialog";
import {
  AttendanceDayDrawer,
  type AttendanceDaySubject,
} from "./AttendanceDayDrawer";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { AttendanceNotesCell } from "@/components/attendance/AttendanceNotesCell";
import { SelfiePreviewDialog } from "@/components/attendance/SelfiePreviewDialog";
import { EarlyArrivalPill } from "@/components/attendance/EarlyArrivalPill";
import { SortableHeader } from "./SortableHeader";
import type { AdminAttendanceSortKey } from "@/lib/actions/attendance.actions";
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
import { deleteAttendanceLog, deleteAttendanceLogsBulk, reviewLateProof } from "@/lib/actions/attendance.actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  formatLocalDate,
  formatTime,
  formatMinutesHuman,
} from "@/lib/utils/date";

interface AttendanceRow {
  id: string;
  user_id: string;
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
  late_proof_reason: string | null;
  late_checkout_reason: string | null;
  /** Mandatory note the employee filled in when checking out from outside
   *  all their assigned geofences. null = checkout was inside radius OR
   *  the employee has no location restrictions. */
  checkout_outside_note: string | null;
  checkout_latitude: number | null;
  checkout_longitude: number | null;
  selfie_path: string | null;
  is_early_arrival: boolean;
  extra_work?: { kind: string }[];
  is_overtime: boolean;
  overtime_minutes: number;
  overtime_status: string | null;
  bonus_day?: boolean;
  profiles: {
    full_name: string;
    email: string;
    avatar_url?: string | null;
    avatar_seed?: string | null;
    position?: string | null;
  };
  attendance_locations?: { name: string } | null;
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
  /** Current server-side sort — null = default order (date desc). */
  sortBy?: AdminAttendanceSortKey | null;
  sortDir?: "asc" | "desc";
}

const OT_BADGE_VARIANT: Record<string, { variant: "tertiary" | "quaternary" | "destructive"; label: string }> = {
  pending: { variant: "tertiary", label: "Pending" },
  approved: { variant: "quaternary", label: "Approved" },
  rejected: { variant: "destructive", label: "Rejected" },
};

export function AttendanceRecapTable({
  rows,
  count,
  page,
  pageSize,
  timezone,
  sortBy = null,
  sortDir = "desc",
}: AttendanceRecapTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // When admin clicks a Konfirmasi item from the global nav bell, the
  // attendance route gets `?focus=<rowId>` — scroll to that row and flash
  // it once mounted. (Same effect as the in-table dropdown's jumpTo().)
  useEffect(() => {
    const focusId = searchParams?.get("focus");
    if (!focusId) return;
    const el = document.getElementById(`att-row-${focusId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
    const t = window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2");
    }, 1800);
    return () => window.clearTimeout(t);
  }, [searchParams]);

  /**
   * Build the URL for a target page, preserving the current filter query
   * (start, end, userId, etc.). Using `URLSearchParams` keeps us from
   * accidentally dropping params when the admin navigates paginated.
   */
  function pageHref(targetPage: number): string {
    const next = new URLSearchParams(searchParams?.toString());
    if (targetPage <= 1) next.delete("page");
    else next.set("page", String(targetPage));
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  }

  /**
   * Cycle through asc → desc → unsorted for the clicked column.
   * Navigates via router.push so the URL stays the source of truth
   * (preserves filters across sort changes too).
   */
  function handleSort(key: AdminAttendanceSortKey) {
    const next = new URLSearchParams(searchParams?.toString());
    // Clear page on sort change — re-sort might push the user's current
    // page out of range.
    next.delete("page");
    if (sortBy === key) {
      if (sortDir === "asc") {
        next.set("sortBy", key);
        next.set("sortDir", "desc");
      } else {
        next.delete("sortBy");
        next.delete("sortDir");
      }
    } else {
      next.set("sortBy", key);
      next.set("sortDir", "asc");
    }
    const qs = next.toString();
    router.push(qs ? `?${qs}` : "?");
  }

  /** Inline helper — pagination controls are rendered above and below
   *  the table, so extracting keeps both copies in sync. */
  const paginationControls =
    Math.ceil(count / pageSize) > 1 ? (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Page {page} of {Math.ceil(count / pageSize)}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={page <= 1 || isPending}
            onClick={() => router.push(pageHref(page - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} className="mr-1" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={page >= Math.ceil(count / pageSize) || isPending}
            onClick={() => router.push(pageHref(page + 1))}
            aria-label="Next page"
          >
            Next
            <ChevronRight size={14} className="ml-1" />
          </Button>
        </div>
      </div>
    ) : null;
  const { t } = useTranslation();
  const tl = t.adminLocations;
  // Selfie preview — shared across all rows; null = closed.
  const [selfieLog, setSelfieLog] = useState<{ id: string; title: string } | null>(null);
  const [drawerSubject, setDrawerSubject] = useState<AttendanceDaySubject | null>(null);

  function openDrawer(row: AttendanceRow) {
    setDrawerSubject({
      logId: row.id,
      userId: row.user_id,
      fullName: row.profiles.full_name,
      avatarUrl: row.profiles.avatar_url ?? null,
      avatarSeed: row.profiles.avatar_seed ?? null,
      date: row.date,
      status: row.status,
      checkedInAt: row.checked_in_at,
      checkedOutAt: row.checked_out_at,
      position: row.profiles.position ?? null,
      locationName: row.attendance_locations?.name ?? null,
      lateMinutes: row.late_minutes ?? null,
      lateProofUrl: row.late_proof_url,
      lateProofReason: row.late_proof_reason,
      lateProofStatus: row.late_proof_status,
      selfiePath: row.selfie_path,
      bonusDay: row.bonus_day ?? false,
    });
  }
  // Batch selection. Scoped to the current page — changing pages clears it
  // (selections are derived from `rows`, which refreshes per page).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  // Clear selection whenever the visible page changes. Selections don't
  // survive pagination because the checkboxes only reflect the current
  // page's rows.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page]);

  const allOnPageSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someOnPageSelected = rows.some((r) => selectedIds.has(r.id));

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelectedIds((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        rows.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await deleteAttendanceLogsBulk(ids);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.deleted} attendance record${result.deleted === 1 ? "" : "s"} deleted`);
      setSelectedIds(new Set());
      setBulkConfirmOpen(false);
      router.refresh();
    });
  }

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
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
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

  const pendingItems = rows
    .flatMap((r) => {
      const items: Array<{
        rowId: string;
        kind: "late_proof" | "overtime";
        employeeName: string;
        date: string;
      }> = [];
      if (r.late_proof_url && r.late_proof_status === "pending") {
        items.push({
          rowId: r.id,
          kind: "late_proof",
          employeeName: r.profiles.full_name || r.profiles.email,
          date: r.date,
        });
      }
      if (r.is_overtime && r.overtime_status === "pending") {
        items.push({
          rowId: r.id,
          kind: "overtime",
          employeeName: r.profiles.full_name || r.profiles.email,
          date: r.date,
        });
      }
      return items;
    });

  return (
    <div className="space-y-3 max-w-full">
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground">
          {count} record{count !== 1 ? "s" : ""} · page {page} of {totalPages}
        </p>
        <PendingConfirmationsButton items={pendingItems} />

        {selectedIds.size > 0 && (
          <>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs font-medium">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedIds(new Set())}
              disabled={isPending} loading={isPending}
              className="h-7 px-2 text-xs"
            >
              Clear
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setBulkConfirmOpen(true)}
              disabled={isPending} loading={isPending}
              className="h-7 px-3 text-xs"
            >
              <Trash2 size={12} className="mr-1" />
              Delete selected
            </Button>
          </>
        )}
      </div>

      {paginationControls}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-2 border-foreground accent-tertiary align-middle"
                  checked={allOnPageSelected}
                  // indeterminate state fires when SOME but not all rows
                  // on this page are selected. DOM-level only; React doesn't
                  // model this attribute directly.
                  ref={(el) => {
                    if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                  }}
                  onChange={toggleAllOnPage}
                  aria-label="Select all rows on this page"
                />
              </TableHead>
              <SortableHeader<AdminAttendanceSortKey>
                sortKey="employee"
                label="Employee"
                currentKey={sortBy}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortableHeader<AdminAttendanceSortKey>
                sortKey="checked_in_at"
                label="Check-in"
                currentKey={sortBy}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortableHeader<AdminAttendanceSortKey>
                sortKey="checked_out_at"
                label="Check-out"
                currentKey={sortBy}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <SortableHeader<AdminAttendanceSortKey>
                sortKey="status"
                label="Status"
                currentKey={sortBy}
                currentDir={sortDir}
                onSort={handleSort}
              />
              <TableHead className=" w-[280px] max-w-[280px]">Overtime</TableHead>
              <TableHead className="w-[420px] max-w-[420px]">{t.attendanceTable.colNotes}</TableHead>
              <TableHead className=" w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => {
              const isOpen = !row.checked_out_at;
              const otBadge = row.overtime_status
                ? OT_BADGE_VARIANT[row.overtime_status] ?? OT_BADGE_VARIANT.pending
                : null;

              const otRequest = row.overtime_requests?.[0];
              // Date column was dropped — instead emit a sticky separator
              // row whenever this row's date differs from the previous one.
              // 8 = remaining column count after removing Date.
              const prevDate = idx === 0 ? null : rows[idx - 1].date;
              const showDateSeparator = row.date !== prevDate;

              return (
                <Fragment key={row.id}>
                  {showDateSeparator && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={8}
                        className="bg-muted/40 border-t-2 border-foreground/10 py-1.5 px-3 text-[11px] font-display font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {formatLocalDate(row.date)}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    id={`att-row-${row.id}`}
                    className={
                      selectedIds.has(row.id)
                        ? "bg-accent"
                        : isOpen
                        ? "bg-tertiary/15"
                        : ""
                    }
                  >
                  <TableCell>
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-2 border-foreground accent-tertiary align-middle"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      aria-label={`Select row for ${row.profiles.full_name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => openDrawer(row)}
                      className="text-left group/emp"
                      title="Open day preview"
                    >
                      <p className="font-display font-bold text-sm group-hover/emp:underline underline-offset-2 decoration-[var(--teal-500)]">
                        {row.profiles.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{row.profiles.email}</p>
                    </button>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-col items-start gap-0.5">
                      {row.selfie_path ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSelfieLog({
                              id: row.id,
                              title: `${row.profiles.full_name} — ${formatLocalDate(row.date)}`,
                            })
                          }
                          className="font-medium tabular-nums text-primary underline-offset-2 hover:underline"
                        >
                          {formatTime(row.checked_in_at, timezone)}
                        </button>
                      ) : (
                        <span className="font-medium tabular-nums">{formatTime(row.checked_in_at, timezone)}</span>
                      )}
                      {row.is_early_arrival && <EarlyArrivalPill />}
                    </div>
                  </TableCell>
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
                          {row.late_proof_reason && (
                            <p
                              className="text-[10px] text-muted-foreground leading-tight break-words italic"
                              title="Alasan dari karyawan — terlihat di slip gaji kalau excuse di-accept"
                            >
                              &ldquo;{row.late_proof_reason}&rdquo;
                            </p>
                          )}
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
                                      onClick={() => {
                                        if (!proofRejectMessage.trim()) {
                                          toast.error("Please provide a rejection reason");
                                          return;
                                        }
                                        handleLateProofReview(row.id, "rejected", proofRejectMessage.trim());
                                      }}
                                      disabled={isPending} loading={isPending}
                                      className="h-6 px-1.5 text-[11px] !text-destructive"
                                    >
                                      Confirm Reject
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 px-1.5 text-[11px] text-muted-foreground"
                                      onClick={() => { setRejectingProofId(null); setProofRejectMessage(""); }}
                                      disabled={isPending} loading={isPending}
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
                                    onClick={() => handleLateProofReview(row.id, "approved")}
                                    disabled={isPending} loading={isPending}
                                    className="h-6 px-1.5 text-[11px] !text-quaternary"
                                  >
                                    <CheckCircle size={10} className="mr-0.5" />
                                    Accept
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setRejectingProofId(row.id)}
                                    disabled={isPending} loading={isPending}
                                    className="h-6 px-1.5 text-[11px] !text-destructive"
                                  >
                                    <XCircle size={10} className="mr-0.5" />
                                    Reject
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                          {row.late_proof_status === "approved" && (
                            <Badge variant="quaternary" className="text-[10px]">
                              Excuse accepted
                            </Badge>
                          )}
                          {row.late_proof_status === "rejected" && (
                            <div className="space-y-0.5">
                              <Badge variant="destructive" className="text-[10px]">
                                Excuse rejected
                              </Badge>
                              {row.late_proof_admin_note && (
                                <p className="text-[10px] text-destructive leading-tight break-words font-medium">
                                  {row.late_proof_admin_note}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="w-[280px] max-w-[280px] overflow-hidden">
                    {row.is_overtime && row.overtime_minutes > 0 && otBadge ? (
                      <div className="space-y-1.5">
                        <Badge variant={otBadge.variant} className="text-[10px]">
                          {formatMinutesHuman(row.overtime_minutes)} ({otBadge.label})
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
                                    onClick={() => {
                                      if (!rejectMessage.trim()) {
                                        toast.error("Please provide a rejection reason");
                                        return;
                                      }
                                      handleOvertimeAction(otRequest.id, "rejected", rejectMessage.trim());
                                    }}
                                    disabled={isPending} loading={isPending}
                                    className="h-7 px-2 text-xs !text-destructive"
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
                                    disabled={isPending} loading={isPending}
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
                                  className="h-7 px-2 text-xs !text-quaternary"
                                  onClick={() => handleOvertimeAction(otRequest.id, "approved")}
                                  disabled={isPending} loading={isPending}
                                >
                                  <CheckCircle size={10} className="mr-0.5" />
                                  Approve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs !text-destructive"
                                  onClick={() => setRejectingId(otRequest.id)}
                                  disabled={isPending} loading={isPending}
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
                            <XCircle size={10} className="mt-0.5 shrink-0 text-destructive" />
                            <p className="text-xs leading-tight break-words text-destructive font-medium">
                              {otRequest.admin_note}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : row.overtime_status === "rejected" && otRequest?.admin_note ? (
                      <div className="space-y-1">
                        <Badge variant="destructive" className="text-[10px]">
                          Rejected
                        </Badge>
                        <div className="flex items-start gap-1 w-full">
                          <XCircle size={10} className="mt-0.5 shrink-0 text-destructive" />
                          <p className="text-xs leading-tight text-destructive font-medium">
                            {otRequest.admin_note}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[420px] align-top whitespace-normal">
                    <AttendanceNotesCell
                      lateCheckoutReason={row.late_checkout_reason}
                      outsideNote={row.checkout_outside_note}
                      checkoutLat={row.checkout_latitude}
                      checkoutLng={row.checkout_longitude}
                      lateCheckoutPrefix={t.attendanceTable.lateCheckoutPrefix}
                      outsideLabel={tl.outsideLocationLabel}
                      viewOnMapsAria={tl.viewOnMapsAria}
                      extraWork={row.extra_work}
                      extraWorkKindLabels={t.extraWork.kindLabels}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 !text-muted-foreground"
                        onClick={() => setEditingRowId(row.id)}
                        disabled={isPending} loading={isPending}
                        title="Edit data presensi"
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 w-7 p-0 ${deletingId === row.id ? "!text-destructive" : "!text-muted-foreground"}`}
                        onClick={() => handleDelete(row.id)}
                        disabled={isPending} loading={isPending}
                        title={deletingId === row.id ? "Click again to confirm" : "Delete record"}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    {deletingId === row.id && (
                      <p className="text-[10px] text-destructive mt-0.5 font-bold">Click to confirm</p>
                    )}
                  </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {paginationControls}

      {/* Inline Proof Preview */}
      {proofPreview && (
        <div className="rounded-2xl border-2 border-foreground bg-card overflow-hidden shadow-hard">
          <div className="flex items-center justify-between px-4 py-2 bg-muted border-b-2 border-foreground">
            <p className="text-sm font-display font-bold">{proofPreview.name}</p>
            <div className="flex items-center gap-1">
              <a
                href={proofPreview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-full text-primary font-bold hover:bg-card transition-colors"
                title="Open in new tab"
              >
                <ExternalLink size={12} strokeWidth={2.5} />
                New tab
              </a>
              <button
                onClick={() => setProofPreview(null)}
                className="flex items-center justify-center size-8 rounded-full border-2 border-foreground bg-card hover:rotate-90 transition-transform"
                title="Close preview"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center bg-muted min-h-[300px] max-h-[70vh]">
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

      <SelfiePreviewDialog
        logId={selfieLog?.id ?? null}
        title={selfieLog?.title ?? ""}
        onOpenChange={(o) => !o && setSelfieLog(null)}
      />

      <AttendanceDayDrawer
        subject={drawerSubject}
        onClose={() => setDrawerSubject(null)}
      />

      <AdminEditAttendanceDialog
        open={editingRowId !== null}
        onOpenChange={(o) => !o && setEditingRowId(null)}
        row={(() => {
          const r = rows.find((x) => x.id === editingRowId);
          if (!r) return null;
          return {
            id: r.id,
            date: r.date,
            checked_in_at: r.checked_in_at,
            checked_out_at: r.checked_out_at,
            status: r.status,
            late_minutes: r.late_minutes,
            is_overtime: r.is_overtime,
            overtime_minutes: r.overtime_minutes,
            overtime_status: r.overtime_status,
            late_checkout_reason: r.late_checkout_reason,
            late_proof_admin_note: r.late_proof_admin_note,
            late_proof_reason: r.late_proof_reason,
            employeeName: r.profiles.full_name,
          };
        })()}
        timezone={timezone}
      />

      <Dialog
        open={bulkConfirmOpen}
        onOpenChange={(o) => !o && setBulkConfirmOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected records?</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-foreground">
                {selectedIds.size} attendance record
                {selectedIds.size === 1 ? "" : "s"}
              </span>{" "}
              will be permanently removed, including any linked overtime
              requests. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkConfirmOpen(false)}
              disabled={isPending} loading={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkDelete}
              disabled={isPending} loading={isPending}
              variant="destructive"
            >
              {isPending ? "Deleting…" : `Delete ${selectedIds.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Bell icon dengan badge count + dropdown listing semua row di halaman
 * yang butuh konfirmasi admin (late proof pending / overtime pending).
 * Tap item → smooth scroll + flash highlight ke row yang bersangkutan.
 */
function PendingConfirmationsButton({
  items,
}: {
  items: Array<{
    rowId: string;
    kind: "late_proof" | "overtime";
    employeeName: string;
    date: string;
  }>;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  function jumpTo(rowId: string) {
    setOpen(false);
    const el = document.getElementById(`att-row-${rowId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Flash highlight via data-attribute toggling Tailwind ring kalau
    // ada — fallback: temp inline style.
    el.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2");
    }, 1800);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border-2 border-amber-400 bg-amber-50 text-amber-900 text-xs font-bold uppercase tracking-wider hover:bg-amber-100"
        aria-label="Buka daftar konfirmasi pending"
      >
        <Bell size={12} />
        Konfirmasi
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white text-[10px] tabular-nums">
          {items.length}
        </span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 mt-1 z-40 w-[320px] rounded-xl border-2 border-amber-300 bg-card shadow-lg p-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 pt-1 pb-2">
              {items.length} butuh konfirmasi di halaman ini
            </p>
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border/40">
              {items.map((it) => (
                <li key={`${it.rowId}-${it.kind}`}>
                  <button
                    type="button"
                    onClick={() => jumpTo(it.rowId)}
                    className="w-full text-left p-2 rounded-md hover:bg-amber-50 flex items-start gap-2"
                  >
                    <span
                      className={
                        "shrink-0 mt-0.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider " +
                        (it.kind === "late_proof"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-sky-100 text-sky-800")
                      }
                    >
                      {it.kind === "late_proof" ? "Late proof" : "Overtime"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {it.employeeName}
                      </p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {formatLocalDate(it.date)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

