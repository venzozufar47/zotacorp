"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * Admin lightbox for a cleaning evidence photo. Fetches a short-lived signed
 * URL from /api/cleaning/photo (mirrors SelfiePreviewDialog).
 */
export function CleaningPhotoDialog({
  completionId,
  title,
  onClose,
}: {
  completionId: string | null;
  title: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!completionId) {
      setUrl(null);
      setError(false);
      return;
    }
    let alive = true;
    setUrl(null);
    setError(false);
    fetch(`/api/cleaning/photo?completionId=${completionId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (alive) setUrl(d.url);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [completionId]);

  return (
    <Dialog open={!!completionId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Bukti foto</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-[3/4] max-h-[60vh] mx-auto bg-black rounded-xl overflow-hidden">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Bukti" className="absolute inset-0 w-full h-full object-cover" />
          ) : error ? (
            <div className="absolute inset-0 grid place-items-center text-white/70 text-sm">
              Gagal memuat foto.
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center text-white/70">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
