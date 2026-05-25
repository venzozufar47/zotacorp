"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  submitPayslipDispute,
  type DisputeField,
  type DisputeRow,
} from "@/lib/actions/payslip-disputes.actions";

interface Props {
  field: DisputeField;
  label: string;
  currentValue: string;
  /** All disputes for the current karyawan — used to pick the open one
   *  for this field (renders an amber "Dilaporkan" badge instead of the
   *  button) and to surface the message on hover. */
  disputes: DisputeRow[];
  /** Visual density. "compact" = icon-only (used in tight cells),
   *  "default" = "Lapor" text + icon. */
  variant?: "compact" | "default";
}

/**
 * Per-field dispute affordance used inside the ContextStrip. Extracted
 * from the deprecated PayslipSettingsReview so individual setting cells
 * keep their per-field reporting + open-state badge.
 */
export function DisputeReportButton({
  field,
  label,
  currentValue,
  disputes,
  variant = "default",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const openDispute = disputes.find(
    (d) => d.field === field && d.status === "open"
  );

  function submit() {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("Tulis detail kesalahannya dulu");
      return;
    }
    startTransition(async () => {
      const res = await submitPayslipDispute({
        field,
        currentValue,
        message: trimmed,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Laporan terkirim ke admin");
      setOpen(false);
      setMessage("");
      router.refresh();
    });
  }

  if (openDispute) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"
        title={`Laporan kamu: ${openDispute.message}`}
      >
        <AlertTriangle size={11} />
        Dilaporkan
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => setOpen(true)}
        className="gap-1"
      >
        <MessageSquare size={11} />
        {variant === "compact" ? null : "Lapor"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lapor: {label} salah</DialogTitle>
            <DialogDescription>
              Sekarang tertulis: <strong>{currentValue}</strong>. Ceritakan apa
              yang salah dan seharusnya berapa — admin akan cek dan balas kamu.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Contoh: Gaji pokok saya seharusnya Rp 4.500.000, sesuai surat kerja bulan Maret."
            disabled={pending}
          />
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
              loading={pending}
            >
              Batal
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !message.trim()}
              loading={pending}
            >
              Kirim ke admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
