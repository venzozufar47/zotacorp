"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Public wrapper — Suspense boundary diperlukan karena
 * `useSearchParams` opt-in ke streaming. Tanpa Suspense, prerender
 * static akan complain di Next 15+.
 */
export function RouteProgressBar() {
  return (
    <Suspense fallback={null}>
      <RouteProgressBarInner />
    </Suspense>
  );
}

/**
 * Top-of-viewport thin animated bar untuk feedback navigasi. Saat URL
 * (pathname / search params) berubah, bar berlari dari kiri ke kanan
 * dan auto-hide setelah halaman baru render. Mengisi gap antara click
 * link dan munculnya skeleton/page baru — tanpa ini user lihat halaman
 * "beku" 100ms-2s tanpa indikasi.
 *
 * Implementasi murni CSS + state — tidak perlu library nprogress.
 */
function RouteProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Phase:
  //   - "idle": invisible.
  //   - "running": 0% → 80% selama navigasi berlangsung.
  //   - "done": 100% → fade out.
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");

  // Immediate click feedback: listen `<a>` clicks anywhere di document
  // dan fire bar SEBELUM Next memulai navigasi. Tanpa ini ada gap
  // 100ms-1s antara klik dan bar muncul (karena pathname-change effect
  // baru jalan setelah server respond).
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // Modifier keys = open in new tab/window — biarkan browser handle.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.button !== 0) return;
      const a = (e.target as Element | null)?.closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (a.target && a.target !== "_self") return;
      // Internal navigation (relative atau same-origin URL).
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        )
          return;
      } catch {
        return;
      }
      setPhase("running");
    }
    document.addEventListener("click", handleClick, { capture: true });
    return () =>
      document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  // Pathname/search change → finish bar. Juga handle programmatic nav
  // (router.push) yang tidak lewat <a> click.
  useEffect(() => {
    setPhase((prev) => (prev === "running" ? "done" : prev));
    const t = window.setTimeout(() => setPhase("idle"), 250);
    return () => window.clearTimeout(t);
  }, [pathname, searchParams]);

  // Safety: kalau bar stuck "running" lebih dari 8 detik (mis. nav
  // gagal / dibatalkan), force clear.
  useEffect(() => {
    if (phase !== "running") return;
    const t = window.setTimeout(() => setPhase("idle"), 8000);
    return () => window.clearTimeout(t);
  }, [phase]);

  const width = phase === "running" ? "80%" : phase === "done" ? "100%" : "0%";
  const opacity = phase === "idle" ? 0 : 1;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[100] h-[3px] pointer-events-none"
      style={{ opacity, transition: "opacity 200ms ease-out" }}
    >
      <div
        className="h-full bg-primary"
        style={{
          width,
          transition:
            phase === "running"
              ? "width 600ms cubic-bezier(0.65, 0, 0.35, 1)"
              : phase === "done"
                ? "width 200ms ease-out"
                : "none",
          boxShadow: "0 0 8px var(--primary)",
        }}
      />
    </div>
  );
}
