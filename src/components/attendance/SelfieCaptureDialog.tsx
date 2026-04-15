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
 * Why the video is rendered unconditionally: React renders before effects
 * run, so setting `video.srcObject` inside the stream-acquisition effect
 * only works if the <video> element is already in the DOM at that point.
 * A prior version rendered the video conditionally on `state === "ready"`,
 * which meant `videoRef.current` was null at srcObject-attach time and the
 * stream never reached the element — black screen. We now always render
 * the video and overlay loading / error states on top.
 */
export function SelfieCaptureDialog({ open, onOpenChange, onConfirm }: Props) {
  const { t } = useTranslation();
  const tc = t.checkIn;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("requesting");
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function startStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // play() is a Promise — Safari in particular rejects if we don't
        // await it. We still swallow the error because autoplay policies
        // occasionally block silently and the UI handles that with the
        // explicit "Take photo" button being disabled until `state = ready`.
        try {
          await video.play();
        } catch {
          // No-op: state below will still flip to "ready" once metadata
          // loads and the user can retry via Retake.
        }
      }
      setState("ready");
    } catch {
      setState("denied");
    }
  }

  // Start / stop the stream whenever the dialog's open state changes.
  useEffect(() => {
    if (!open) {
      stopStream();
      setPreview(null);
      return;
    }
    startStream();
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Revoke any preview object URL we created, so we don't leak.
  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  async function takePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

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
    await startStream();
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
          {/* Video is ALWAYS in the DOM so `videoRef.current` is non-null
              by the time startStream()'s await resolves. Visibility is
              controlled by CSS — mirrored to match the user's pose. */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover scale-x-[-1] ${
              state === "ready" && !preview ? "" : "invisible"
            }`}
          />

          {preview && (
            <img
              src={preview.url}
              alt="Selfie preview"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {!preview && state === "requesting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
              <Loader2 size={24} className="animate-spin" />
              <span className="text-sm">{tc.selfieRequesting}</span>
            </div>
          )}

          {!preview && (state === "denied" || state === "unavailable") && (
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
