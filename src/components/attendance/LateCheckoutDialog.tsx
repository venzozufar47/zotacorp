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
import { formatLocalDate } from "@/lib/utils/date";

interface LateCheckoutDialogProps {
  attendanceLogId: string;
  date: string;
  checkedInAt: string;
}

export function LateCheckoutDialog({
  attendanceLogId,
  date,
  checkedInAt,
}: LateCheckoutDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!time) {
      toast.error("Please enter a checkout time");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please provide a reason for the missed checkout");
      return;
    }

    startTransition(async () => {
      const result = await lateCheckout({
        attendanceLogId,
        checkoutTime: time,
        reason: reason.trim(),
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Checkout time recorded");
      setOpen(false);
      setTime("");
      setReason("");
      router.refresh();
    });
  }

  // Extract check-in time for display
  const checkinTime = new Date(checkedInAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ background: "#fef3c7", color: "#92400e" }}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !time || !reason.trim()}
            style={{ background: "var(--primary)" }}
          >
            {isPending ? "Saving…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
