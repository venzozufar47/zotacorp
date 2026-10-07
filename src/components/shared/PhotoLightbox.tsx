"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface LightboxPhoto {
  url: string;
  title: string;
}

/**
 * Penampil foto layar penuh. Tutup lewat tombol X, tap latar, atau Esc;
 * ganti foto lewat panah, tombol ←/→, atau geser jari. Dipakai karyawan
 * (melihat foto buktinya) dan admin (memeriksa foto per item).
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
  const touchX = useRef<number | null>(null);
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
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start === null || end === undefined) return;
        const dx = end - start;
        if (dx > 60 && hasPrev) onIndexChange(index - 1);
        else if (dx < -60 && hasNext) onIndexChange(index + 1);
      }}
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

      <div className="relative flex-1 min-h-0 grid place-items-center px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.title}
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
        {hasPrev && (
          <button
            type="button"
            aria-label="Foto sebelumnya"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(index - 1);
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 size-11 grid place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            aria-label="Foto berikutnya"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange(index + 1);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 size-11 grid place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
