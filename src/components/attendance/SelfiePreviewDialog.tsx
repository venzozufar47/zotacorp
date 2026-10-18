"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markSelfieOverrideReviewed } from "@/lib/actions/attendance-selfie.actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface Props {
  /** The attendance log id whose selfie we want to preview. `null` = closed. */
  logId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Displayed above the photo — e.g. "Budi — 15 Apr 2026". */
  title: string;
  /** Gemini's read on this selfie — 'anomaly' | 'ok' | null (not checked).
   *  Purely informational; see migration 134. Optional so other callers
   *  (e.g. AttendanceHistoryTable, an employee viewing their own photo)
   *  don't need to thread it through. */
  aiFlag?: string | null;
  aiNote?: string | null;
  /** Filter selfie AI (migrasi 192): ok | overridden | unchecked | null. Hanya admin yang melihat tombol tinjau. */
  aiVerdict?: string | null;
  aiReviewedAt?: string | null;
  /** Admin boleh menandai kasus "tetap absen walau ditolak AI" sudah ditinjau. */
  canReview?: boolean;
}

/**
 * Read-only selfie viewer. Fetches a 60-second signed URL via our API
 * route (ownership/admin-gated server-side) and renders the image.
 */
export function SelfiePreviewDialog({
  logId,
  onOpenChange,
  title,
  aiFlag,
  aiNote,
  aiVerdict,
  aiReviewedAt,
  canReview = false,
}: Props) {
  const { t } = useTranslation();
  const ts = t.attendanceTable;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  async function markReviewed() {
    if (!logId) return;
    setReviewing(true);
    const res = await markSelfieOverrideReviewed([logId]);
    setReviewing(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Ditandai sudah ditinjau");
    onOpenChange(false);
  }

  useEffect(() => {
    if (!logId) return;
    setLoading(true);
    setError(null);
    setUrl(null);

    let cancelled = false;
    fetch(`/api/attendance/selfie?logId=${encodeURIComponent(logId)}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !body.url) {
          setError(body.error ?? ts.selfieLoadError);
        } else {
          setUrl(body.url);
        }
      })
      .catch(() => {
        if (!cancelled) setError(ts.selfieLoadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [logId, ts.selfieLoadError]);

  return (
    <Dialog open={logId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ts.selfieDialogTitle}</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>

        {/* Same responsive pattern as the capture dialog — aspect when
            width limits, viewport height cap when height limits. */}
        <div className="relative aspect-[3/4] max-h-[60vh] mx-auto bg-black rounded-xl overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
              <Loader2 size={24} className="animate-spin" />
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 px-6 text-center">
              <X size={32} />
              <span className="text-sm">{error}</span>
            </div>
          )}
          {url && !loading && (
            <img src={url} alt="Selfie" className="w-full h-full object-cover" />
          )}
        </div>

        {aiVerdict === "overridden" && (
          <div className="space-y-2 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-foreground">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>
                  <strong className="font-semibold">AI menolak foto ini</strong>, tetapi karyawan memilih tetap
                  absen{aiReviewedAt ? " (sudah ditinjau)" : ""}.
                </p>
                {aiNote && (
                  <ul className="list-disc pl-4 text-muted-foreground">
                    {aiNote.split("\n").filter(Boolean).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {canReview && !aiReviewedAt && (
              <Button size="sm" variant="outline" className="w-full" disabled={reviewing} onClick={markReviewed}>
                {reviewing ? "Menyimpan…" : "Tandai sudah ditinjau"}
              </Button>
            )}
          </div>
        )}
        {aiVerdict === "unchecked" && (
          <p className="text-xs text-muted-foreground">AI tidak sempat memeriksa foto ini; absen lolos tanpa pemeriksaan.</p>
        )}

        {aiFlag === "anomaly" && (
          <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-foreground">
            <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
            <span>
              <strong className="font-semibold">Ditandai AI:</strong>{" "}
              {aiNote || "foto ini terlihat tidak biasa — mohon dicek manual."}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
