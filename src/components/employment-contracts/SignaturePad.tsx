"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Pencil, Upload, X } from "lucide-react";

/**
 * Input tanda tangan dengan dua mode:
 *  - "draw": kanvas (pointer + touch) → PNG transparan.
 *  - "upload": unggah gambar tanda tangan (PNG/JPG/WebP).
 * Keduanya memanggil `onBlob(blob)` saat siap, dan `onBlob(null)` saat
 * dibersihkan. PNG transparan disarankan agar bisa ditimpa di atas meterai.
 */
export function SignaturePad({
  onBlob,
  disabled,
}: {
  onBlob: (blob: Blob | null) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<"draw" | "upload">("draw");

  const switchMode = (m: "draw" | "upload") => {
    if (m === mode) return;
    onBlob(null); // reset signature saat ganti mode
    setMode(m);
  };

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-lg border-2 border-foreground overflow-hidden text-xs font-semibold">
        <button
          type="button"
          onClick={() => switchMode("draw")}
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${
            mode === "draw"
              ? "bg-foreground text-background"
              : "bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          <Pencil size={13} strokeWidth={2.5} /> Gambar
        </button>
        <button
          type="button"
          onClick={() => switchMode("upload")}
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 border-l-2 border-foreground ${
            mode === "upload"
              ? "bg-foreground text-background"
              : "bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          <Upload size={13} strokeWidth={2.5} /> Upload PNG
        </button>
      </div>

      {mode === "draw" ? (
        <DrawPad onBlob={onBlob} disabled={disabled} />
      ) : (
        <UploadPad onBlob={onBlob} disabled={disabled} />
      )}
    </div>
  );
}

// ── Draw mode ─────────────────────────────────────────────────────────

function DrawPad({
  onBlob,
  disabled,
}: {
  onBlob: (blob: Blob | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#111827";
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const start = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasInk.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (hasInk.current) {
      setEmpty(false);
      canvasRef.current?.toBlob((b) => onBlob(b), "image/png");
    }
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onBlob(null);
  };

  return (
    <div className="space-y-1.5">
      <div className="relative rounded-xl border-2 border-foreground bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="block w-full h-[180px] touch-none cursor-crosshair"
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Tanda tangan di sini
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        disabled={disabled || empty}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        <Eraser size={13} strokeWidth={2.5} /> Bersihkan
      </button>
    </div>
  );
}

// ── Upload mode ───────────────────────────────────────────────────────

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const MAX = 3 * 1024 * 1024;

function UploadPad({
  onBlob,
  disabled,
}: {
  onBlob: (blob: Blob | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pick = (file: File | null) => {
    setError(null);
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError("Hanya PNG / JPG / WebP.");
      return;
    }
    if (file.size > MAX) {
      setError("Ukuran maksimal 3 MB.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    onBlob(file);
  };

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    onBlob(null);
  };

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        disabled={disabled}
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      {preview ? (
        <div className="relative rounded-xl border-2 border-foreground bg-white overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Pratinjau tanda tangan"
            className="block w-full h-[180px] object-contain"
          />
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="absolute top-2 right-2 size-7 rounded-full border-2 border-foreground bg-card flex items-center justify-center hover:bg-muted"
            aria-label="Hapus gambar"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="w-full h-[180px] rounded-xl border-2 border-dashed border-foreground bg-white flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Upload size={22} strokeWidth={2.2} />
          <span className="text-sm font-medium">Pilih gambar tanda tangan</span>
          <span className="text-[11px]">PNG transparan disarankan · maks 3 MB</span>
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
