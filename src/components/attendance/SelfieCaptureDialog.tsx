"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Check, X, Loader2, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { toast } from "sonner";
import { encodeCanvas, MAX_EDGE_SELFIE, SELFIE_QUALITY } from "@/lib/images/compress-image";

/**
 * Frame hitam = kamera belum mengeluarkan gambar (baru menyala / diblokir aplikasi lain / izin setengah jalan).
 * Cek murah di kanvas kecil 24x24: rata-rata terang sangat rendah DAN tidak ada piksel yang terang.
 */
function isBlackFrame(source: HTMLCanvasElement): boolean {
  const probe = document.createElement("canvas");
  probe.width = 24;
  probe.height = 24;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  if (!pctx) return false;
  pctx.drawImage(source, 0, 0, 24, 24);
  const { data } = pctx.getImageData(0, 0, 24, 24);
  let sum = 0;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += luma;
    if (luma > max) max = luma;
  }
  return sum / (data.length / 4) < 6 && max < 24;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user confirms their photo. Parent uploads + submits. */
  onConfirm: (blob: Blob) => void;
  /** Override the dialog heading (defaults to the check-in selfie copy). */
  title?: string;
  /** Override the dialog subtitle (defaults to the check-in selfie copy). */
  description?: string;
  /** Optional reference image shown as an overlay so the user can match the
   *  intended angle/framing (used by the cleaning checklist). */
  referenceUrl?: string;
  /** Which camera to open first: "user" (front, default — for selfies) or
   *  "environment" (back — for cleaning evidence). The user can still flip. */
  defaultFacingMode?: FacingMode;
  /** Teks panduan; bila diisi, tampil oval wajah + teks di atas kamera (hanya saat live, bukan preview). */
  faceGuide?: string;
  /** Naikkan angkanya untuk memaksa "foto ulang" dari luar (mis. setelah AI menolak foto). */
  retakeToken?: number;
  /** Induk sedang mengunggah/memeriksa foto: kunci tombol agar tidak terkirim berulang. */
  busy?: boolean;
}

type CameraState = "requesting" | "ready" | "denied" | "unavailable";
type FacingMode = "user" | "environment";

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
export function SelfieCaptureDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  referenceUrl,
  defaultFacingMode = "user",
  faceGuide,
  retakeToken = 0,
  busy = false,
}: Props) {
  const { t } = useTranslation();
  const tc = t.checkIn;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("requesting");
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [refExpanded, setRefExpanded] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>(defaultFacingMode);

  function stopStream() {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function startStream(mode: FacingMode = facingMode) {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
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
      setRefExpanded(false);
      return;
    }
    setFacingMode(defaultFacingMode);
    startStream(defaultFacingMode);
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

  // Foto ulang atas perintah induk (token naik); render awal (token 0) tidak melakukan apa-apa.
  useEffect(() => {
    if (retakeToken > 0) void retake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retakeToken]);

  async function takePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    // Belum ada frame yang siap digambar → hasilnya hitam. Minta tunggu sebentar.
    if (video.readyState < 2) {
      toast.error("Kamera belum siap, tunggu sebentar lalu coba lagi.");
      return;
    }

    // Batasi sisi TERPANJANG, bukan lebar. Versi sebelumnya membatasi
    // `videoWidth` ke 800, dan karena kamera HP merekam potret (720×1280)
    // syarat itu tidak pernah terpenuhi — foto tersimpan utuh 720×1280.
    // Itulah kenapa bucket foto tumbuh jauh lebih cepat dari dugaan.
    const scale = Math.min(
      1,
      MAX_EDGE_SELFIE / Math.max(video.videoWidth, video.videoHeight)
    );
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    if (isBlackFrame(canvas)) {
      // Jangan simpan foto hitam; kamera tetap menyala supaya bisa langsung dicoba lagi.
      toast.error("Foto hitam — kamera belum menangkap gambar. Pastikan lensa tidak tertutup lalu ambil lagi.");
      return;
    }

    // WebP q0.7, mundur ke JPEG kalau peramban tidak bisa meng-encode-nya.
    // Pemanggil WAJIB menurunkan ekstensi dan contentType dari `blob.type`,
    // bukan mengasumsikan .jpg — lihat CheckInButton & CleaningChecklistCard.
    const blob = await encodeCanvas(canvas, SELFIE_QUALITY);
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
    await startStream(facingMode);
  }

  // Flip between front (user) and back (environment) camera. facingMode is a
  // preference, not `exact`, so single-camera devices just keep their camera.
  async function flipCamera() {
    const next: FacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    stopStream();
    await startStream(next);
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
      <DialogContent className="sm:max-w-[380px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? tc.selfieTitle}</DialogTitle>
          <DialogDescription>{description ?? tc.selfieSubtitle}</DialogDescription>
        </DialogHeader>

        {/* Cap the preview by viewport height so the dialog always fits
            on short / zoomed-in browsers. `aspect-[3/4]` still defines
            the shape when width is the limiting dimension, but
            `max-h-[50vh]` wins on narrow viewports and shrinks width to
            preserve the 3:4 ratio. `mx-auto` keeps it centered when the
            height cap kicks in. */}
        <div className="relative aspect-[3/4] max-h-[50vh] mx-auto bg-black rounded-xl overflow-hidden">
          {/* Video is ALWAYS in the DOM so `videoRef.current` is non-null
              by the time startStream()'s await resolves. Visibility is
              controlled by CSS — mirrored to match the user's pose. */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover ${
              facingMode === "user" ? "scale-x-[-1]" : ""
            } ${state === "ready" && !preview ? "" : "invisible"}`}
          />

          {/* Flip front/back camera — only while the live feed is up. */}
          {!preview && state === "ready" && (
            <button
              type="button"
              onClick={flipCamera}
              title="Putar kamera (depan/belakang)"
              aria-label="Putar kamera"
              className="absolute top-2 left-2 z-10 grid place-items-center size-9 rounded-full bg-black/55 text-white hover:bg-black/75 transition"
            >
              <SwitchCamera size={18} />
            </button>
          )}

          {/* Panduan wajah: oval + area di luarnya digelapkan. Tidak menangkap sentuhan. */}
          {faceGuide && !preview && state === "ready" && (
            <div className="pointer-events-none absolute inset-0 z-[5]">
              <div className="absolute left-1/2 top-[8%] w-[66%] -translate-x-1/2 aspect-[3/4] rounded-[50%] border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
              <p className="absolute inset-x-2 bottom-2 rounded-lg bg-black/60 px-2 py-1 text-center text-[11px] font-medium leading-snug text-white">
                {faceGuide}
              </p>
            </div>
          )}

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

          {/* Reference overlay — tap to expand/shrink so the user can match
              the intended framing while shooting. */}
          {referenceUrl && (
            <button
              type="button"
              onClick={() => setRefExpanded((v) => !v)}
              className={
                refExpanded
                  ? "absolute inset-0 z-10 bg-black/70 flex items-center justify-center p-2"
                  : "absolute top-2 right-2 z-10 w-20 rounded-lg overflow-hidden border-2 border-white/90 shadow-lg"
              }
              title={refExpanded ? "Tutup contoh" : "Lihat contoh"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={referenceUrl}
                alt="Contoh foto"
                className={
                  refExpanded
                    ? "max-h-full max-w-full object-contain"
                    : "w-full aspect-[3/4] object-cover"
                }
              />
              {!refExpanded && (
                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-bold text-center py-0.5">
                  CONTOH
                </span>
              )}
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {preview ? (
            <>
              <Button variant="outline" onClick={retake} disabled={busy} className="flex-1">
                <RotateCcw size={14} className="mr-1.5" />
                {tc.selfieRetake}
              </Button>
              <Button onClick={confirm} disabled={busy} className="flex-1">
                {busy ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <Check size={14} className="mr-1.5" />
                )}
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
