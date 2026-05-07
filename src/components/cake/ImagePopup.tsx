"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { createPortal } from "react-dom";

interface Props {
  url: string;
  alt?: string;
  onClose: () => void;
}

/**
 * Draggable image preview overlay. Replaces the previous
 * `<a target="_blank">` flow on the order-detail and slip-checklist
 * pages so admin can compare the photo against the spec without
 * losing the page they were on.
 *
 * Drag-to-move is implemented with pointer events on the header bar;
 * the body is the image which still pinch-zooms on touch devices.
 * Escape and clicks on the dimmed backdrop close the popup.
 */
export function ImagePopup({ url, alt, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: d.originX + (e.clientX - d.startX),
      y: d.originY + (e.clientY - d.startY),
    });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer capture wasn't held on touch — safe to ignore
    }
  };

  if (typeof window === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className="rounded-2xl bg-card border-2 border-foreground shadow-2xl max-w-[90vw] max-h-[90vh] flex flex-col"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 border-b-2 border-foreground cursor-move select-none touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="text-xs font-medium text-muted-foreground">
            Foto referensi
          </div>
          <div className="flex items-center gap-1">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
            >
              <ExternalLink size={11} strokeWidth={2.5} />
              Buka di tab baru
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Tutup"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-muted/30 flex items-center justify-center p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt ?? ""}
            draggable={false}
            className="max-w-full max-h-[80vh] rounded-lg select-none"
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
