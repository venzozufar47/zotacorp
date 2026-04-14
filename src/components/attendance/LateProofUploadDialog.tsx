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

interface LateProofUploadDialogProps {
  attendanceLogId: string;
  hasExistingProof?: boolean;
}

export function LateProofUploadDialog({
  attendanceLogId,
  hasExistingProof = false,
}: LateProofUploadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("attendanceLogId", attendanceLogId);

      const res = await fetch("/api/attendance/upload-proof", {
        method: "POST",
        body: formData,
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body.error ?? "Upload failed");
        setUploading(false);
        return;
      }

      toast.success("Proof uploaded — waiting for admin approval");
      setOpen(false);
      setFile(null);
      setUploading(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <button
          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1.5 min-h-[32px] rounded transition-all hover:bg-blue-50"
          style={{ color: "#3b82f6" }}
        >
          {hasExistingProof ? (
            <>
              <FileText size={14} /> Proof uploaded
            </>
          ) : (
            <>
              <Upload size={14} /> Upload proof
            </>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Late Permission Proof</DialogTitle>
          <DialogDescription>
            Upload a photo or document showing your permission to arrive late. Accepted: JPEG, PNG, PDF (max 5MB).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div
            className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all hover:border-[var(--primary)] hover:bg-[var(--accent)]"
            onClick={() => inputRef.current?.click()}
          >
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <FileText size={18} style={{ color: "var(--primary)" }} />
                <span className="font-medium truncate max-w-[200px]">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({(file.size / 1024).toFixed(0)} KB)
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload size={24} className="mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to select a file
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{ background: "var(--primary)" }}
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
