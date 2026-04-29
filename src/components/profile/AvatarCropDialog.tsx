"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  /** Source image (object URL) — null when dialog should be hidden. */
  src: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Returns the cropped square as JPEG blob (~360px). */
  onConfirm: (blob: Blob) => void;
  pending?: boolean;
}

const OUTPUT_SIZE = 360;

export function AvatarCropDialog({
  src,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const croppedAreaPx = useRef<Area | null>(null);

  // Reset transform whenever a new source is loaded.
  useEffect(() => {
    if (src) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    }
  }, [src]);

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => {
    croppedAreaPx.current = areaPx;
  }, []);

  async function confirm() {
    if (!src || !croppedAreaPx.current) return;
    const blob = await cropToBlob(src, croppedAreaPx.current, rotation);
    if (blob) onConfirm(blob);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atur foto profil</DialogTitle>
          <DialogDescription>
            Geser untuk reposisi, zoom in/out, dan putar kalau perlu.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full aspect-square bg-muted rounded-xl overflow-hidden">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <ZoomOut size={14} className="text-muted-foreground shrink-0" />
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary"
              aria-label="Zoom"
            />
            <ZoomIn size={14} className="text-muted-foreground shrink-0" />
          </label>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="gap-1"
            >
              <RotateCw size={12} /> Putar 90°
            </Button>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              Zoom {zoom.toFixed(2)}× · Putar {rotation}°
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Batal
          </Button>
          <Button onClick={confirm} disabled={pending} loading={pending}>
            Simpan crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Crop + rotate the source image inside a canvas, output a JPEG blob
 * normalized to OUTPUT_SIZE × OUTPUT_SIZE so storage stays small and
 * subsequent renders are predictable.
 */
async function cropToBlob(
  src: string,
  pixelCrop: Area,
  rotation: number
): Promise<Blob | null> {
  const img = await loadImage(src);
  const radians = (rotation * Math.PI) / 180;

  // First render the rotated source onto an oversized canvas so the
  // crop coordinates (which react-easy-crop computes in the rotated
  // frame) align cleanly.
  const safe =
    Math.max(img.width, img.height) * 2;
  const stage = document.createElement("canvas");
  stage.width = safe;
  stage.height = safe;
  const sctx = stage.getContext("2d");
  if (!sctx) return null;
  sctx.translate(safe / 2, safe / 2);
  sctx.rotate(radians);
  sctx.drawImage(img, -img.width / 2, -img.height / 2);

  // Pull out the crop region from the rotated stage. react-easy-crop's
  // pixelCrop is relative to the natural image — but `getImageData` from
  // the rotated stage uses stage coords. Translate.
  const data = sctx.getImageData(
    pixelCrop.x + safe / 2 - img.width / 2,
    pixelCrop.y + safe / 2 - img.height / 2,
    pixelCrop.width,
    pixelCrop.height
  );

  const out = document.createElement("canvas");
  out.width = OUTPUT_SIZE;
  out.height = OUTPUT_SIZE;
  const octx = out.getContext("2d");
  if (!octx) return null;

  // Drop the cropped slice into a temp canvas, then scale to OUTPUT_SIZE.
  const tmp = document.createElement("canvas");
  tmp.width = pixelCrop.width;
  tmp.height = pixelCrop.height;
  tmp.getContext("2d")?.putImageData(data, 0, 0);
  octx.drawImage(tmp, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  return new Promise((resolve) => {
    out.toBlob((b) => resolve(b), "image/jpeg", 0.9);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}
