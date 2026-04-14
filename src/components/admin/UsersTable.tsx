"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Clock, Sparkles } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { toast } from "sonner";
import { format } from "date-fns";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: "employee" | "admin";
  created_at: string;
  is_flexible_schedule: boolean;
  /** HH:MM, already normalized server-side. */
  work_start_time: string;
  /** HH:MM, already normalized server-side. */
  work_end_time: string;
}

interface UsersTableProps {
  rows: UserRow[];
  currentUserId: string;
}

export function UsersTable({ rows, currentUserId }: UsersTableProps) {
  const router = useRouter();
  const [target, setTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="👥"
        title="No users yet"
        description="New sign-ups will appear here."
      />
    );
  }

  async function handleDelete() {
    if (!target) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: target.id }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body.error ?? "Failed to delete user");
        setDeleting(false);
        return;
      }

      toast.success(`Deleted ${target.full_name || target.email}`);
      setTarget(null);
      setDeleting(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border overflow-x-auto bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f5f5f7]">
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Name
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Email
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Role
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Schedule
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Joined
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isSelf = row.id === currentUserId;
              return (
                <TableRow key={row.id} className="hover:bg-[#f5f5f7]/40">
                  <TableCell className="font-medium text-sm">
                    {row.full_name || "—"}
                    {isSelf && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className="text-xs px-2"
                      style={{
                        background:
                          row.role === "admin" ? "#e0f2fe" : "#f0fdf4",
                        color:
                          row.role === "admin" ? "#0369a1" : "#15803d",
                        border: "none",
                      }}
                    >
                      {row.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ScheduleCell row={row} onEdit={() => setEditing(row)} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(row.created_at), "d MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/admin/users/${row.id}`}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Pencil size={16} />
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isSelf}
                        onClick={() => setTarget(row)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete user?</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="font-semibold text-foreground">
                {target?.full_name || target?.email}
              </span>{" "}
              and all their attendance records. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScheduleEditDialog
        row={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
    </>
  );
}

/**
 * Compact schedule cell — doubles as the affordance to open the inline
 * edit dialog. Renders one of two glyphs so flexible vs fixed reads at a
 * glance without the admin parsing time values:
 *   - ✨ "Flexible"                                   (gray badge)
 *   - 🕒 "09:00 – 18:00"                              (tabular-nums)
 */
function ScheduleCell({ row, onEdit }: { row: UserRow; onEdit: () => void }) {
  const isFlexible = row.is_flexible_schedule;
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors",
        "hover:bg-[#f5f5f7] hover:border-foreground/20",
        isFlexible
          ? "border-dashed border-muted-foreground/30 text-muted-foreground"
          : "border-border text-foreground"
      )}
      aria-label="Edit schedule"
    >
      {isFlexible ? (
        <>
          <Sparkles size={12} />
          <span className="font-medium">Flexible</span>
        </>
      ) : (
        <>
          <Clock size={12} className="text-muted-foreground" />
          <span className="font-medium tabular-nums">
            {row.work_start_time} – {row.work_end_time}
          </span>
        </>
      )}
    </button>
  );
}

/**
 * Inline schedule editor.
 *
 * Invariants enforced here (also respected across attendance + payslip):
 *   - `is_flexible_schedule === true` ⇒ attendance logic ignores
 *     start/end times entirely (no late tracking, no overtime prompt).
 *     We still preserve the stored times so toggling OFF restores a
 *     sensible default instead of jumping to 00:00.
 *   - start < end: surfaced as an inline validation error. The DB
 *     doesn't enforce this, but every consumer assumes it, so we catch
 *     it at write time rather than letting it bleed into payslip math.
 */
function ScheduleEditDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  row: UserRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [flexible, setFlexible] = useState(false);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed local state every time a new row is targeted so the dialog
  // reflects *that* user's current values rather than the last edit.
  useEffect(() => {
    if (!row) return;
    setFlexible(row.is_flexible_schedule);
    setStart(row.work_start_time);
    setEnd(row.work_end_time);
    setError(null);
  }, [row]);

  async function handleSave() {
    if (!row) return;
    setError(null);

    if (!flexible) {
      if (!start || !end) {
        setError("Both start and end times are required.");
        return;
      }
      if (start >= end) {
        setError("End time must be after start time.");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetId: row.id,
          is_flexible_schedule: flexible,
          // Always send the time values so attendance history and payslip
          // `standardWorkingHours` keep a stable reference. When flexible
          // is on the downstream consumers short-circuit on that flag and
          // don't care what the times are.
          work_start_time: start,
          work_end_time: end,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body.error ?? "Failed to update schedule");
        setSaving(false);
        return;
      }

      toast.success(
        flexible
          ? `${row.full_name || row.email} is now on a flexible schedule`
          : `Schedule saved · ${start} – ${end}`
      );
      setSaving(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Edit schedule</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">
              {row?.full_name || row?.email}
            </span>
            {" — "}
            drives attendance lateness, overtime, and payslip calculations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Flexible toggle — the governing switch. When on, time fields
              are disabled so the UI matches the stored invariant. */}
          <label className="flex items-start gap-3 rounded-xl border border-border bg-[#f5f5f7]/60 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={flexible}
              onChange={(e) => setFlexible(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input accent-[color:var(--primary)]"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">Flexible schedule</div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                No fixed sign-in/out time. Exempt from lateness tracking
                and the overtime prompt. Payslip "standard working hours"
                is treated as informational only.
              </div>
            </div>
          </label>

          <div
            className={cn(
              "grid grid-cols-2 gap-3 transition-opacity",
              flexible && "opacity-50 pointer-events-none"
            )}
          >
            <div className="space-y-1.5">
              <Label htmlFor="start" className="text-xs">
                Sign-in time
              </Label>
              <Input
                id="start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                disabled={flexible}
                step={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end" className="text-xs">
                Sign-out time
              </Label>
              <Input
                id="end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                disabled={flexible}
                step={60}
              />
            </div>
          </div>

          {!flexible && (
            <div className="text-xs text-muted-foreground leading-relaxed">
              Late threshold and overtime windows are derived from these two
              values (plus the grace period on the user's profile page).
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/8 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{ background: "var(--primary)" }}
            className="text-white"
          >
            {saving ? "Saving…" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
