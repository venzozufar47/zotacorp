"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Trash2,
  Clock,
  Sparkles,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: "employee" | "admin";
  business_unit: string | null;
  job_role: string | null;
  is_flexible_schedule: boolean;
  /** HH:MM, normalized server-side. */
  work_start_time: string;
  /** HH:MM, normalized server-side. */
  work_end_time: string;
  grace_period_min: number;
  profile_complete: boolean;
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
                Schedule
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Business Unit
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Position
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Profile
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
                    <div className="flex items-center gap-2">
                      <span>{row.full_name || "—"}</span>
                      {row.role === "admin" && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: "#e0f2fe", color: "#0369a1" }}
                        >
                          admin
                        </span>
                      )}
                      {isSelf && (
                        <span className="text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ScheduleCell row={row} onEdit={() => setEditing(row)} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.business_unit ? (
                      row.business_unit
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.job_role ? (
                      row.job_role
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ProfileStatus complete={row.profile_complete} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/admin/users/${row.id}`}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "text-muted-foreground hover:text-foreground"
                        )}
                        aria-label="Open full profile"
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
                        aria-label="Delete user"
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
 * edit dialog.
 *
 *   - ✨ Flexible                                         (dashed badge)
 *   - 🕒 09:00 – 18:00  +  +15m grace                     (stacked pair)
 *
 * The grace period sits under the time range in a subdued line so it
 * reads as metadata, not a second primary value. For flexible users the
 * grace period is preserved in the DB (it's still written to attendance
 * logs for historical context) but isn't surfaced here — lateness
 * tracking is off for them, so displaying a grace number would be noise.
 */
function ScheduleCell({ row, onEdit }: { row: UserRow; onEdit: () => void }) {
  const isFlexible = row.is_flexible_schedule;
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "inline-flex flex-col items-start gap-0.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors text-left",
        "hover:bg-[#f5f5f7] hover:border-foreground/20",
        isFlexible
          ? "border-dashed border-muted-foreground/30 text-muted-foreground"
          : "border-border text-foreground"
      )}
      aria-label="Edit schedule and grace period"
    >
      {isFlexible ? (
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Sparkles size={12} />
          Flexible
        </span>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
            <Clock size={12} className="text-muted-foreground" />
            {row.work_start_time} – {row.work_end_time}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums pl-[18px]">
            +{row.grace_period_min}m grace
          </span>
        </>
      )}
    </button>
  );
}

/**
 * Profile completion status badge. Boolean on purpose — the admin
 * overview doesn't need a percentage here; the detail page shows which
 * specific sections are incomplete. A single yes/no cell scans faster.
 */
function ProfileStatus({ complete }: { complete: boolean }) {
  if (complete) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: "#15803d" }}
      >
        <CheckCircle2 size={14} />
        Complete
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <CircleDashed size={14} />
      Incomplete
    </span>
  );
}

/**
 * Inline schedule editor.
 *
 * Invariants enforced here (also respected across attendance + payslip):
 *   - `is_flexible_schedule === true` ⇒ attendance logic ignores
 *     start/end times + grace period entirely. We still preserve those
 *     values so toggling OFF restores a sensible default instead of
 *     jumping to 00:00 / 0m.
 *   - start < end: surfaced as an inline validation error. The DB
 *     doesn't enforce this, but every consumer assumes it, so we catch
 *     it at write time rather than letting it bleed into payslip math.
 *   - grace_period_min is clamped 0–120. The DB accepts any integer,
 *     but UX-wise "2 hours grace" is already past the point where the
 *     schedule itself is misconfigured.
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
  const [grace, setGrace] = useState(15);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed local state every time a new row is targeted so the dialog
  // reflects *that* user's current values rather than the last edit.
  useEffect(() => {
    if (!row) return;
    setFlexible(row.is_flexible_schedule);
    setStart(row.work_start_time);
    setEnd(row.work_end_time);
    setGrace(row.grace_period_min);
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
      if (!Number.isFinite(grace) || grace < 0 || grace > 120) {
        setError("Grace period must be between 0 and 120 minutes.");
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
          // Always send the time + grace values so attendance history and
          // payslip `standardWorkingHours` keep a stable reference. When
          // flexible is on, downstream consumers short-circuit on that
          // flag and don't care what these values are.
          work_start_time: start,
          work_end_time: end,
          grace_period_min: Math.round(grace),
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
          : `Schedule saved · ${start}–${end} · ${grace}m grace`
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
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Edit schedule</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">
              {row?.full_name || row?.email}
            </span>
            {" — "}
            drives attendance lateness, overtime prompt, and payslip
            calculations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Flexible toggle — the governing switch. When on, time + grace
              fields are disabled so the UI matches the stored invariant. */}
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
                No fixed sign-in/out time. Exempt from lateness tracking,
                grace period, and the overtime prompt. Payslip "standard
                working hours" is treated as informational only.
              </div>
            </div>
          </label>

          <div
            className={cn(
              "space-y-3 transition-opacity",
              flexible && "opacity-50 pointer-events-none"
            )}
          >
            <div className="grid grid-cols-2 gap-3">
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

            <div className="space-y-1.5">
              <Label htmlFor="grace" className="text-xs">
                Grace period (minutes)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="grace"
                  type="number"
                  min={0}
                  max={120}
                  step={1}
                  value={Number.isFinite(grace) ? grace : ""}
                  onChange={(e) => setGrace(Number(e.target.value))}
                  disabled={flexible}
                  className="w-24 tabular-nums"
                />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  The first <span className="font-medium">{grace}</span>{" "}
                  minutes past sign-in time aren't counted as late.
                </span>
              </div>
            </div>
          </div>

          {!flexible && (
            <div className="text-xs text-muted-foreground leading-relaxed">
              Late threshold = sign-in + grace. Overtime prompt triggers
              after sign-out time.
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
