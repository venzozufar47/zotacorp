"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user confirms their photo. Parent uploads + submits. */
  onConfirm: (blob: Blob) => void;
}

type CameraState = "requesting" | "ready" | "denied" | "unavailable";

/**
 * Live selfie capture — uses getUserMedia so gallery uploads are impossible
 * (unlike `<input capture="user">` which falls back to the file picker on
 * desktop and some Android browsers).
 *
 * Flow:
 *   1. Open → request front camera
 *   2. <video> shows live preview
 *   3. Tap "Take photo" → draw current frame to canvas, downsize, show still
 *   4. Tap "Retake" → back to live preview
 *   5. Tap "Use this photo" → hand Blob to parent via onConfirm
 *
 * The stream is torn down eagerly on close/unmount and whenever we pivot to
 * the still-preview state, so the camera light never lingers.
 */
export function SelfieCaptureDialog({ open, onOpenChange, onConfirm }: Props) {
  const { t } = useTranslation();
  const tc = t.checkIn;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("requesting");
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);

  // Start camera when the dialog opens; clean up when it closes. We do not
  // share the stream across open/close cycles — cleaner to re-request, which
  // also forces a fresh permission check if the user revoked it externally.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setState("requesting");
    setPreview(null);

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setState("ready");
      } catch {
        if (!cancelled) setState("denied");
      }
    }

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Also revoke any preview object URL we created, so we don't leak.
  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function takePhoto() {
    const video = videoRef.current;
    if (!video) return;

    // Downsize to max 800px wide. Keeps upload ~100KB on a modern phone
    // camera (1280×720 → 800×450 JPEG 0.8 ≈ 60–120KB).
    const maxW = 800;
    const scale = Math.min(1, maxW / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8)
    );
    if (!blob) return;

    // Stop the live stream while the still is on screen — saves battery
    // and turns the camera indicator off so users know it's frozen.
    stopStream();
    const url = URL.createObjectURL(blob);
    setPreview({ blob, url });
  }

  async function retake() {
    if (preview) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    }
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState("ready");
    } catch {
      setState("denied");
    }
  }

  function confirm() {
    if (!preview) return;
    onConfirm(preview.blob);
    // Parent closes the dialog after a successful submit, so we don't
    // revoke the URL here — doing so would blank the preview if the
    // submission takes a moment and the parent keeps the dialog open.
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) stopStream();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{tc.selfieTitle}</DialogTitle>
          <DialogDescription>{tc.selfieSubtitle}</DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[3/4] bg-black rounded-xl overflow-hidden">
          {preview ? (
            <img
              src={preview.url}
              alt="Selfie preview"
              // Match the mirrored video above so the still looks the same
              className="w-full h-full object-cover"
            />
          ) : state === "ready" ? (
            <video
              ref={videoRef}
              playsInline
              muted
              // Mirror the live preview so it behaves like a mirror — what
              // the user sees on-screen matches how they're posing.
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : state === "requesting" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
              <Loader2 size={24} className="animate-spin" />
              <span className="text-sm">{tc.selfieRequesting}</span>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 px-6 text-center">
              <X size={32} />
              <span className="text-sm">
                {state === "unavailable" ? tc.selfieUnavailable : tc.selfieDenied}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {preview ? (
            <>
              <Button variant="outline" onClick={retake} className="flex-1">
                <RotateCcw size={14} className="mr-1.5" />
                {tc.selfieRetake}
              </Button>
              <Button onClick={confirm} className="flex-1">
                <Check size={14} className="mr-1.5" />
                {tc.selfieUseThis}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                {tc.selfieCancel}
              </Button>
              <Button
                onClick={takePhoto}
                disabled={state !== "ready"}
                className="flex-1"
              >
                <Camera size={14} className="mr-1.5" />
                {tc.selfieCapture}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
