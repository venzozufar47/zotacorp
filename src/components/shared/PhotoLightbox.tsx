"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";

export interface LightboxPhoto {
  url: string;
  title: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Penampil foto layar penuh. Tutup lewat tombol X, tap latar, atau Esc;
 * ganti foto lewat panah, tombol ←/→, atau geser jari. Foto bisa DIPERBESAR:
 * cubit dua jari, ketuk dua kali, roda mouse, atau tombol +/−; saat diperbesar
 * satu jari menggeser foto (bukan pindah foto). Dipakai karyawan (foto
 * referensi & buktinya) dan admin (memeriksa foto per item).
 */
export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: LightboxPhoto[];
  /** null = tertutup. */
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const open = index !== null && photos[index] !== undefined;

  useEffect(() => {
    if (!open || index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index! > 0) onIndexChange(index! - 1);
      else if (e.key === "ArrowRight" && index! < photos.length - 1) onIndexChange(index! + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, photos.length, onClose, onIndexChange]);

  if (!open || index === null) return null;
  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={photo.title}
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{photo.title}</p>
          {photos.length > 1 && (
            <p className="text-xs text-white/70">
              {index + 1} dari {photos.length}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="size-11 shrink-0 grid place-items-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <X size={20} />
        </button>
      </div>

      {/* key = url: pindah foto mereset zoom tanpa efek tambahan */}
      <ZoomSurface
        key={photo.url}
        photo={photo}
        onPrev={hasPrev ? () => onIndexChange(index - 1) : null}
        onNext={hasNext ? () => onIndexChange(index + 1) : null}
      />
    </div>
  );
}

/**
 * Area foto dengan zoom & geser. Pakai Pointer Events (satu kode untuk jari dan
 * mouse). `touch-action: none` supaya gestur jari sampai ke sini dan bukan
 * dipakai browser untuk menggulir/zoom halaman.
 */
function ZoomSurface({
  photo,
  onPrev,
  onNext,
}: {
  photo: LightboxPhoto;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  // Jari sedang menyentuh: transisi dimatikan agar foto mengikuti jari tanpa lag.
  const [touching, setTouching] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // Keadaan awal gestur yang sedang berjalan.
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const pan = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const downAt = useRef<{ x: number; t: number } | null>(null);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  // Gestur (geser/cubit) yang selesai di latar jangan dianggap "tap latar → tutup".
  const suppressClick = useRef(false);
  // Pointer capture membuat event click diarahkan ke area ini, bukan ke <img>;
  // jadi "tap di foto" vs "tap di latar hitam" dibedakan dari target pointerdown.
  const downOnBackdrop = useRef(false);

  function bounded(s: number, x: number, y: number) {
    const el = surfaceRef.current;
    if (s <= MIN_SCALE || !el) return { s: MIN_SCALE, x: 0, y: 0 };
    const maxX = ((s - 1) * el.clientWidth) / 2;
    const maxY = ((s - 1) * el.clientHeight) / 2;
    return { s, x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
  }

  function zoomTo(next: number) {
    setT((cur) => bounded(clamp(next, MIN_SCALE, MAX_SCALE), cur.x, cur.y));
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) downOnBackdrop.current = e.target === e.currentTarget;
    setTouching(true);
    suppressClick.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: t.s };
      pan.current = null;
      downAt.current = null;
      suppressClick.current = true;
    } else if (pointers.current.size === 1) {
      pan.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y };
      downAt.current = { x: e.clientX, t: Date.now() };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const s = clamp((pinch.current.scale * dist) / pinch.current.dist, MIN_SCALE, MAX_SCALE);
      setT((cur) => bounded(s, cur.x, cur.y));
      return;
    }
    if (pointers.current.size === 1 && pan.current) {
      const dx = e.clientX - pan.current.px;
      const dy = e.clientY - pan.current.py;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) suppressClick.current = true;
      // Hanya menggeser foto saat sudah diperbesar; di ukuran normal biarkan
      // jadi gestur "swipe ganti foto" (diputuskan saat jari diangkat).
      if (t.s > 1) setT(bounded(t.s, pan.current.x + dx, pan.current.y + dy));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setTouching(false);
    if (pointers.current.size < 2) pinch.current = null;

    if (!wasSingle || !downAt.current || !pan.current) return;
    const dx = e.clientX - pan.current.px;
    const dy = e.clientY - pan.current.py;
    const quick = Date.now() - downAt.current.t < 300;
    const still = Math.abs(dx) < 10 && Math.abs(dy) < 10;

    if (t.s <= 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      // Geser ke kanan = foto sebelumnya, ke kiri = berikutnya.
      if (dx > 0) onPrev?.();
      else onNext?.();
    } else if (quick && still) {
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < 300 && Math.abs(prev.x - e.clientX) < 30) {
        // Ketuk dua kali: perbesar / kembali normal.
        suppressClick.current = true;
        setT(t.s > 1 ? { s: 1, x: 0, y: 0 } : bounded(DOUBLE_TAP_SCALE, 0, 0));
        lastTap.current = null;
      } else {
        lastTap.current = { x: e.clientX, y: e.clientY, t: now };
      }
    }
    pan.current = null;
    downAt.current = null;
  }

  /** Browser mengambil alih gestur (mis. sistem): bersihkan saja, jangan dianggap geser/ketuk. */
  function onPointerCancel(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setTouching(false);
    pinch.current = null;
    pan.current = null;
    downAt.current = null;
    suppressClick.current = true;
  }

  return (
    <div
      ref={surfaceRef}
      className="relative flex-1 min-h-0 grid place-items-center overflow-hidden px-2 pb-[max(1rem,env(safe-area-inset-bottom))] select-none"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={(e) => zoomTo(t.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
      onClick={(e) => {
        // Hanya tap di latar hitam (tanpa geser/cubit) yang menutup penampil.
        if (suppressClick.current || !downOnBackdrop.current) {
          e.stopPropagation();
          suppressClick.current = false;
        }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.title}
        className="max-h-full max-w-full rounded-lg object-contain will-change-transform"
        style={{
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
          transition: touching ? "none" : "transform 150ms ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {onPrev && t.s <= 1 && (
        <button
          type="button"
          aria-label="Foto sebelumnya"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 size-11 grid place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {onNext && t.s <= 1 && (
        <button
          type="button"
          aria-label="Foto berikutnya"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 size-11 grid place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <ChevronRight size={22} />
        </button>
      )}

      {/* Kontrol zoom */}
      <div
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/60 p-1 text-white"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Perkecil"
          disabled={t.s <= MIN_SCALE}
          onClick={() => zoomTo(t.s / 1.6)}
          className="size-10 grid place-items-center rounded-full hover:bg-white/20 disabled:opacity-40"
        >
          <Minus size={18} />
        </button>
        <span className="min-w-12 text-center text-xs font-semibold tabular-nums">
          {Math.round(t.s * 100)}%
        </span>
        <button
          type="button"
          aria-label="Perbesar"
          disabled={t.s >= MAX_SCALE}
          onClick={() => zoomTo(t.s * 1.6)}
          className="size-10 grid place-items-center rounded-full hover:bg-white/20 disabled:opacity-40"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
