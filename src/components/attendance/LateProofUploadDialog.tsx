"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, FileText } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface LateProofUploadDialogProps {
  attendanceLogId: string;
  hasExistingProof?: boolean;
}

export function LateProofUploadDialog({
  attendanceLogId,
  hasExistingProof = false,
}: LateProofUploadDialogProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const lp = t.lateProof;
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) return;
    if (!reason.trim()) {
      toast.error("Tulis alasan telat dulu");
      return;
    }
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("attendanceLogId", attendanceLogId);
      formData.append("reason", reason.trim());

      const res = await fetch("/api/attendance/upload-proof", {
        method: "POST",
        body: formData,
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body.error ?? lp.uploadFailed);
        setUploading(false);
        return;
      }

      toast.success(lp.uploadedToast);
      setOpen(false);
      setFile(null);
      setReason("");
      setUploading(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : lp.uploadFailed);
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center gap-1.5 text-[10px] font-display font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border-2 border-foreground bg-pop-pink text-foreground hover:-translate-y-0.5 transition-transform shadow-hard-sm">
        {hasExistingProof ? (
          <>
            <FileText size={12} strokeWidth={2.5} /> {lp.uploadedBadge}
          </>
        ) : (
          <>
            <Upload size={12} strokeWidth={2.5} /> {lp.uploadButton}
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{lp.dialogTitle}</DialogTitle>
          <DialogDescription>
            {lp.dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div
            className="border-2 border-dashed border-foreground/40 rounded-2xl p-6 text-center cursor-pointer transition-all hover:border-primary hover:bg-accent"
            onClick={() => inputRef.current?.click()}
          >
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileText size={18} className="text-primary" strokeWidth={2.5} />
                <span className="font-bold truncate max-w-[200px]">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({(file.size / 1024).toFixed(0)} KB)
                </span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <span className="inline-flex items-center justify-center size-12 rounded-full border-2 border-foreground bg-tertiary mx-auto mb-1">
                  <Upload size={20} strokeWidth={2.5} className="text-foreground" />
                </span>
                <p className="text-sm text-muted-foreground font-medium">
                  {lp.clickToSelect}
                </p>
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <div className="space-y-1">
            <label className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground">
              Alasan telat *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Mis. Macet panjang di Jl. Pemuda karena kecelakaan, sudah ada foto buktinya."
              className="w-full text-sm border-2 border-foreground/40 rounded-xl px-3 py-2 focus:outline-none focus:border-primary"
              disabled={uploading}
            />
            <p className="text-[11px] text-muted-foreground">
              Akan ditampilkan ke admin saat review, dan ke kamu sendiri di
              slip gaji kalau alasan diterima.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {lp.cancel}
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!file || !reason.trim() || uploading}
          >
            {uploading ? lp.uploading : lp.upload}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
