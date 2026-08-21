"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
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
}: Props) {
  const { t } = useTranslation();
  const ts = t.attendanceTable;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
