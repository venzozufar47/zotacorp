"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

/** Jarak tarik (px, sesudah diredam) yang memicu muat ulang. */
const THRESHOLD = 64;
/** Batas tarik maksimum yang tampak. */
const MAX_PULL = 96;
/** Redaman: jari bergerak 2 px, indikator bergerak 1 px, supaya terasa berat dan tidak terpicu tak sengaja. */
const DAMPING = 0.5;

/** Elemen yang membuat tarik-ke-bawah harus mengalah: isian, dialog, atau area yang punya gulir sendiri. */
function shouldIgnore(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest("input, textarea, select, [contenteditable='true'], [data-no-ptr]")) return true;
  // Dialog/sheet terbuka: tarikan di dalamnya bukan milik halaman.
  if (document.querySelector("[role='dialog'], [aria-modal='true']")) return true;
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    const scrollsY = (style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight;
    if (scrollsY && el.scrollTop > 0) return true;
  }
  return false;
}

/**
 * Tarik halaman ke bawah dari paling atas untuk memuat ulang (aplikasi PWA tidak punya bilah alamat atau tombol muat ulang
 * peramban). Muat ulang penuh mengambil data dan versi terbaru karena service worker kita tidak menyimpan halaman.
 *
 * Hati-hati supaya tidak mengganggu: hanya pada perangkat sentuh, hanya saat halaman sudah di paling atas, gerakan harus
 * dominan vertikal, diredam, dan batal bila jari kembali naik. Tidak aktif di dalam isian, dialog, dan area gulir sendiri.
 * Tombol ikon di bilah bawah tetap ada sebagai cara yang terlihat (gestur saja tidak cukup untuk semua orang).
 */
export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const state = useRef({ active: false, startX: 0, startY: 0, pull: 0, refreshing: false });

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const s = state.current;
    // Cegah gestur bawaan peramban (efek pantul/refresh bawaan) bertabrakan dengan milik kita.
    const prevOverscroll = document.documentElement.style.overscrollBehaviorY;
    document.documentElement.style.overscrollBehaviorY = "contain";

    const reset = () => {
      s.active = false;
      s.pull = 0;
      setPull(0);
    };

    const onStart = (e: TouchEvent) => {
      if (s.refreshing || e.touches.length !== 1 || window.scrollY > 0 || shouldIgnore(e.target)) return;
      s.active = true;
      s.startX = e.touches[0].clientX;
      s.startY = e.touches[0].clientY;
      s.pull = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!s.active) return;
      const dy = e.touches[0].clientY - s.startY;
      const dx = e.touches[0].clientX - s.startX;
      // Naik, atau halaman sudah mulai tergulir, atau gerakan lebih mendatar: bukan tarik-muat-ulang.
      if (dy <= 0 || window.scrollY > 0 || Math.abs(dx) > dy) {
        if (s.pull > 0) reset();
        else s.active = false;
        return;
      }
      if (dy < 10) return;
      if (e.cancelable) e.preventDefault();
      s.pull = Math.min(MAX_PULL, dy * DAMPING);
      setPull(s.pull);
    };

    const onEnd = () => {
      if (!s.active) return;
      const triggered = s.pull >= THRESHOLD;
      s.active = false;
      if (!triggered) return reset();
      s.refreshing = true;
      setRefreshing(true);
      setPull(THRESHOLD);
      window.setTimeout(() => window.location.reload(), 200);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      document.documentElement.style.overscrollBehaviorY = prevOverscroll;
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, []);

  if (pull <= 0 && !refreshing) return null;
  const progress = Math.min(1, pull / THRESHOLD);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2 md:hidden"
      style={{ top: `calc(env(safe-area-inset-top, 0px) + ${Math.round(pull) - 20}px)`, opacity: Math.max(0.25, progress) }}
    >
      <span className="flex size-9 items-center justify-center rounded-full border-2 border-foreground bg-card text-foreground">
        <RefreshCw
          size={16}
          strokeWidth={2.5}
          className={refreshing ? "animate-spin" : undefined}
          style={refreshing ? undefined : { transform: `rotate(${Math.round(progress * 270)}deg)` }}
        />
      </span>
    </div>
  );
}
