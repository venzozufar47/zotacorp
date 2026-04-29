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
import { SortableHeader, type SortDir } from "./SortableHeader";
import { sortRows } from "@/lib/utils/sort";

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

const STATUS_BADGES: Record<string, { variant: "tertiary" | "quaternary" | "destructive"; label: string }> = {
  pending: { variant: "tertiary", label: "Pending" },
  approved: { variant: "quaternary", label: "Approved" },
  rejected: { variant: "destructive", label: "Rejected" },
};

type OvertimeSortKey = "employee" | "date" | "hours" | "status";

export function OvertimeRequestsTable({ rows, activeTab }: OvertimeRequestsTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [sortKey, setSortKey] = useState<OvertimeSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: OvertimeSortKey) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const accessors: Record<OvertimeSortKey, (r: OvertimeRow) => string | number> = {
    employee: (r) => r.profiles.full_name || r.profiles.email,
    date: (r) => r.date,
    hours: (r) => r.overtime_minutes,
    status: (r) => r.status,
  };

  const displayRows = sortKey
    ? sortRows(rows, accessors[sortKey], sortDir)
    : rows;

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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader<OvertimeSortKey>
                sortKey="employee"
                label="Employee"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={toggleSort}
              />
              <SortableHeader<OvertimeSortKey>
                sortKey="date"
                label="Date"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={toggleSort}
              />
              <SortableHeader<OvertimeSortKey>
                sortKey="hours"
                label="Hours"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={toggleSort}
              />
              <TableHead>Reason</TableHead>
              <SortableHeader<OvertimeSortKey>
                sortKey="status"
                label="Status"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={toggleSort}
              />
              {activeTab === "pending" && (
                <TableHead>Actions</TableHead>
              )}
              {activeTab !== "pending" && (
                <TableHead>Note</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.map((row) => {
              const hours = Math.round((row.overtime_minutes / 60) * 10) / 10;
              const badge = STATUS_BADGES[row.status] ?? STATUS_BADGES.pending;

              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <div>
                      <p className="font-display font-bold text-sm">{row.profiles.full_name}</p>
                      <p className="text-xs text-muted-foreground">{row.profiles.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-display font-bold">
                    {formatLocalDate(row.date)}
                  </TableCell>
                  <TableCell className="text-sm font-display font-bold tabular-nums">
                    {hours}h
                  </TableCell>
                  <TableCell className="text-sm max-w-[200px]">
                    <p className="truncate font-medium" title={row.reason}>
                      {row.reason}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={badge.variant} className="text-[10px]">
                      {badge.label}
                    </Badge>
                  </TableCell>
                  {activeTab === "pending" ? (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs !text-quaternary"
                          onClick={() => handleApprove(row.id)}
                          disabled={isPending} loading={isPending}
                        >
                          <CheckCircle size={14} className="mr-1" strokeWidth={2.5} />
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs !text-destructive"
                          onClick={() => openReject(row.id)}
                          disabled={isPending} loading={isPending}
                        >
                          <XCircle size={14} className="mr-1" strokeWidth={2.5} />
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
              disabled={isPending} loading={isPending}
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
