"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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

interface OvertimePromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (isOvertime: boolean, reason: string) => void;
}

export function OvertimePromptModal({
  open,
  onOpenChange,
  onConfirm,
}: OvertimePromptModalProps) {
  const [choice, setChoice] = useState<"overtime" | "forgot" | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit() {
    if (choice === "overtime" && !reason.trim()) return;
    setSubmitting(true);
    onConfirm(choice === "overtime", reason.trim());
  }

  function handleClose() {
    setChoice(null);
    setReason("");
    setSubmitting(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Overtime Check</DialogTitle>
          <DialogDescription>
            You&apos;re checking out past the standard end time. Did you work overtime?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <button
            type="button"
            onClick={() => setChoice("overtime")}
            className={`w-full p-4 rounded-2xl border-2 text-left transition-all text-sm ${
              choice === "overtime"
                ? "border-foreground bg-accent shadow-hard-sm"
                : "border-border bg-background hover:border-foreground/40"
            }`}
          >
            <span className="font-display font-bold text-base block">I worked overtime</span>
            <p className="text-xs text-muted-foreground mt-1 font-medium">
              Submit an overtime request for admin approval
            </p>
          </button>

          <button
            type="button"
            onClick={() => setChoice("forgot")}
            className={`w-full p-4 rounded-2xl border-2 text-left transition-all text-sm ${
              choice === "forgot"
                ? "border-foreground bg-accent shadow-hard-sm"
                : "border-border bg-background hover:border-foreground/40"
            }`}
          >
            <span className="font-display font-bold text-base block">I just forgot to sign out</span>
            <p className="text-xs text-muted-foreground mt-1 font-medium">
              Check out normally without overtime
            </p>
          </button>

          {choice === "overtime" && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs">Reason for overtime *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe why you worked overtime…"
                rows={3}
                required
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !choice ||
              submitting ||
              (choice === "overtime" && !reason.trim())
            }
          >
            {submitting ? "Processing…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
