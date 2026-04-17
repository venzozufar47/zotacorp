"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { lateCheckout } from "@/lib/actions/attendance.actions";
import { formatLocalDate, formatTime } from "@/lib/utils/date";

interface LateCheckoutDialogProps {
  attendanceLogId: string;
  date: string;
  checkedInAt: string;
  workEndTime?: string; // "HH:mm" or "HH:mm:ss"
  isFlexibleSchedule?: boolean;
  /** Admin-configured org timezone — always wins over browser local. */
  timezone?: string;
}

export function LateCheckoutDialog({
  attendanceLogId,
  date,
  checkedInAt,
  workEndTime,
  isFlexibleSchedule,
  timezone,
}: LateCheckoutDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [isOvertime, setIsOvertime] = useState(false);
  const [overtimeReason, setOvertimeReason] = useState("");
  const [isPending, startTransition] = useTransition();

  // Determine if selected time qualifies for overtime
  const eligibleForOvertime = (() => {
    if (!time || !workEndTime || isFlexibleSchedule) return false;
    const [h, m] = time.split(":").map(Number);
    const [eh, em] = workEndTime.split(":").map(Number);
    if (isNaN(h) || isNaN(m) || isNaN(eh) || isNaN(em)) return false;
    return h * 60 + m > eh * 60 + em;
  })();

  function handleSubmit() {
    if (!time) {
      toast.error("Please enter a checkout time");
      return;
    }
    // Block same-or-before check-in (compare minute-of-day)
    const [th, tm] = time.split(":").map(Number);
    const [ch, cm] = checkinTime.split(":").map(Number);
    if (!isNaN(th) && !isNaN(ch)) {
      const checkoutMin = th * 60 + tm;
      const checkinMin = ch * 60 + cm;
      if (checkoutMin <= checkinMin) {
        toast.error(`Checkout time must be after check-in (${checkinTime})`);
        return;
      }
    }
    if (!reason.trim()) {
      toast.error("Please provide a reason for the missed checkout");
      return;
    }
    if (eligibleForOvertime && isOvertime && !overtimeReason.trim()) {
      toast.error("Please provide an overtime reason");
      return;
    }

    startTransition(async () => {
      const result = await lateCheckout({
        attendanceLogId,
        checkoutTime: time,
        reason: reason.trim(),
        isOvertime: eligibleForOvertime && isOvertime,
        overtimeReason: eligibleForOvertime && isOvertime ? overtimeReason.trim() : undefined,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        eligibleForOvertime && isOvertime
          ? "Checkout recorded — overtime pending admin review"
          : "Checkout time recorded"
      );
      setOpen(false);
      setTime("");
      setReason("");
      setIsOvertime(false);
      setOvertimeReason("");
      router.refresh();
    });
  }

  // Extract check-in time for display — always rendered in the admin
  // org timezone so late-checkout comparisons match the attendance
  // calculation. Never uses the browser's local timezone.
  const checkinTime = formatTime(checkedInAt, timezone);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[10px] font-display font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border-2 border-foreground bg-tertiary text-foreground hover:-translate-y-0.5 transition-transform shadow-hard-sm"
      >
        Missing — Add checkout
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Late Checkout</DialogTitle>
          <DialogDescription>
            Add checkout time for {formatLocalDate(date)} (checked in at {checkinTime})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Checkout Time *</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              min={checkinTime}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason for missed checkout *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why did you forget to check out?"
              rows={3}
              required
            />
          </div>

          {eligibleForOvertime && (
            <div className="space-y-2 p-4 rounded-2xl border-2 border-foreground bg-tertiary/30">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOvertime}
                  onChange={(e) => setIsOvertime(e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-foreground accent-primary"
                />
                <span className="font-display text-sm font-bold uppercase tracking-wide">
                  Count as overtime (past {workEndTime?.slice(0, 5)})
                </span>
              </label>
              {isOvertime && (
                <Textarea
                  value={overtimeReason}
                  onChange={(e) => setOvertimeReason(e.target.value)}
                  placeholder="What did you work on after hours?"
                  rows={2}
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !time || !reason.trim()}
          >
            {isPending ? "Saving…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
