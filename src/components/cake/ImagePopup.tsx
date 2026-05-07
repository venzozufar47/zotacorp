"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Minus, Plus, RotateCcw, X } from "lucide-react";
import { createPortal } from "react-dom";

interface Props {
  url: string;
  alt?: string;
  onClose: () => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;

/**
 * Draggable + zoomable image preview overlay. Replaces the previous
 * `<a target="_blank">` flow on order-detail and slip-checklist pages
 * so admin and the production team can compare a reference photo
 * against the spec without losing the page they were on.
 *
 * - Header bar drags the card around.
 * - Mouse wheel / +/- buttons zoom around the image center.
 * - Pinch-to-zoom on touch (two-finger gesture).
 * - Double-click resets to fit.
 * - Escape and clicks on the dimmed backdrop close the popup.
 */
export function ImagePopup({ url, alt, onClose }: Props) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  // Two-pointer pinch state for touch zoom.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => clampZoom(z * 1.2));
      if (e.key === "-") setZoom((z) => clampZoom(z / 1.2));
      if (e.key === "0") {
        setZoom(1);
        setPos({ x: 0, y: 0 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Header drag — only when a single pointer is active.
  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      x: d.originX + (e.clientX - d.startX),
      y: d.originY + (e.clientY - d.startY),
    });
  };
  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // pointer capture wasn't held on touch — safe to ignore
    }
  };

  // Body — wheel zoom + pinch zoom.
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom((z) => clampZoom(z * factor));
  };
  const onBodyPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      pinchRef.current = { dist: distance(a, b), zoom };
    }
  };
  const onBodyPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = Array.from(pointersRef.current.values());
      const d = distance(a, b);
      const factor = d / pinchRef.current.dist;
      setZoom(clampZoom(pinchRef.current.zoom * factor));
    }
  };
  const onBodyPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
  };

  const onDoubleClick = () => {
    setZoom(1);
    setPos({ x: 0, y: 0 });
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
        className="rounded-2xl bg-card border-2 border-foreground shadow-2xl max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 border-b-2 border-foreground cursor-move select-none touch-none"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
        >
          <div className="text-xs font-medium text-muted-foreground">
            Foto referensi
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z / 1.25))}
              className="rounded-md border border-border bg-card p-1 text-foreground hover:bg-muted disabled:opacity-40"
              disabled={zoom <= MIN_ZOOM + 0.001}
              aria-label="Perkecil"
            >
              <Minus size={12} strokeWidth={2.5} />
            </button>
            <span className="tabular-nums text-[11px] text-muted-foreground w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z * 1.25))}
              className="rounded-md border border-border bg-card p-1 text-foreground hover:bg-muted disabled:opacity-40"
              disabled={zoom >= MAX_ZOOM - 0.001}
              aria-label="Perbesar"
            >
              <Plus size={12} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPos({ x: 0, y: 0 });
              }}
              className="rounded-md border border-border bg-card p-1 text-foreground hover:bg-muted"
              aria-label="Reset"
            >
              <RotateCcw size={12} strokeWidth={2.5} />
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted ml-1"
            >
              <ExternalLink size={11} strokeWidth={2.5} />
              <span className="hidden sm:inline">Buka di tab baru</span>
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
        <div
          className="flex-1 overflow-hidden bg-muted/30 flex items-center justify-center p-2 touch-none select-none"
          onWheel={onWheel}
          onPointerDown={onBodyPointerDown}
          onPointerMove={onBodyPointerMove}
          onPointerUp={onBodyPointerUp}
          onPointerCancel={onBodyPointerUp}
          onDoubleClick={onDoubleClick}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt ?? ""}
            draggable={false}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "center center",
              transition: dragRef.current ? "none" : "transform 80ms linear",
            }}
            className="max-w-full max-h-[80vh] rounded-lg select-none"
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function distance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
