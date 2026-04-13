"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/EmptyState";
import { reviewOvertimeRequest } from "@/lib/actions/overtime.actions";
import { formatLocalDate } from "@/lib/utils/date";
import { CheckCircle, XCircle } from "lucide-react";

interface OvertimeRow {
  id: string;
  attendance_log_id: string;
  user_id: string;
  date: string;
  overtime_minutes: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles: {
    full_name: string;
    email: string;
  };
}

interface OvertimeRequestsTableProps {
  rows: OvertimeRow[];
  activeTab: string;
}

const STATUS_BADGES: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#fff7ed", color: "#ff9f0a", label: "Pending" },
  approved: { bg: "#f0fdf4", color: "#34c759", label: "Approved" },
  rejected: { bg: "#fef2f2", color: "#ff3b30", label: "Rejected" },
};

export function OvertimeRequestsTable({ rows, activeTab }: OvertimeRequestsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="⏰"
        title={`No ${activeTab} overtime requests`}
        description={
          activeTab === "pending"
            ? "All overtime requests have been reviewed."
            : "No overtime requests match this filter."
        }
      />
    );
  }

  function handleApprove(id: string) {
    startTransition(async () => {
      const result = await reviewOvertimeRequest(id, "approved");
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Overtime approved");
        router.refresh();
      }
    });
  }

  function openReject(id: string) {
    setSelectedId(id);
    setAdminNote("");
    setRejectDialogOpen(true);
  }

  function handleReject() {
    if (!selectedId) return;
    startTransition(async () => {
      const result = await reviewOvertimeRequest(selectedId, "rejected", adminNote);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Overtime rejected");
        setRejectDialogOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="rounded-xl border overflow-x-auto bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f5f5f7]">
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Employee</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Date</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Hours</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Reason</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">Status</TableHead>
              {activeTab === "pending" && (
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Actions</TableHead>
              )}
              {activeTab !== "pending" && (
                <TableHead className="text-xs font-semibold uppercase tracking-wide">Note</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const hours = Math.round((row.overtime_minutes / 60) * 10) / 10;
              const badge = STATUS_BADGES[row.status] ?? STATUS_BADGES.pending;

              return (
                <TableRow key={row.id} className="hover:bg-[#f5f5f7]/40">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{row.profiles.full_name}</p>
                      <p className="text-xs text-muted-foreground">{row.profiles.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatLocalDate(row.date)}
                  </TableCell>
                  <TableCell className="text-sm font-semibold">
                    {hours}h
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px]">
                    <p className="truncate" title={row.reason}>
                      {row.reason}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className="text-[10px] px-2"
                      style={{ background: badge.bg, color: badge.color, border: "none" }}
                    >
                      {badge.label}
                    </Badge>
                  </TableCell>
                  {activeTab === "pending" ? (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleApprove(row.id)}
                          disabled={isPending}
                          style={{ color: "#34c759" }}
                        >
                          <CheckCircle size={14} className="mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openReject(row.id)}
                          disabled={isPending}
                          style={{ color: "#ff3b30" }}
                        >
                          <XCircle size={14} className="mr-1" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  ) : (
                    <TableCell className="text-xs text-muted-foreground max-w-[150px]">
                      <p className="truncate" title={row.admin_note ?? ""}>
                        {row.admin_note || "—"}
                      </p>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Overtime</DialogTitle>
            <DialogDescription>
              Optionally add a note explaining why this overtime is rejected.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Reason for rejection (optional)…"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={isPending}
              variant="destructive"
            >
              {isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
