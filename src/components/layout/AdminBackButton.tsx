"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Back button shared by the desktop topbar and the mobile top strip.
 *
 * `router.back()` — real browser/session history, NOT a breadcrumb-derived
 * "up one route level". The ask was specifically "kembali ke apa yang saya
 * buka sebelumnya" (back to whatever page was open before this one, not
 * this page's parent route) — e.g. from `/admin/finance/pnl` opened via
 * `/admin/cleaning`, Back must return to Cleaning, not jump to `/admin/finance`.
 * Only `history.back()` semantics deliver that; deriving from the pathname
 * cannot, since a route's parent has no relation to what the admin actually
 * had open a moment ago.
 *
 * This also makes the button the ONLY way back when the app runs as an
 * installed PWA (standalone display mode has no browser chrome at all) —
 * not just a convenience on desktop.
 *
 * Disabled when there's nothing to go back to (a fresh tab, a deep link, a
 * PWA cold-launch). `history.length` only grows and never shrinks as the
 * user navigates, so it can occasionally under-detect a stack the user has
 * already walked back through — harmless, the button just stays enabled
 * one click too long instead of graying out early.
 */
export function AdminBackButton({
  variant = "desktop",
}: {
  variant?: "desktop" | "mobile";
}) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    // window.history tidak ada saat SSR, jadi ini WAJIB baca di klien setelah mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanGoBack(window.history.length > 1);
  }, []);

  const className =
    variant === "mobile"
      ? "flex items-center justify-center size-9 shrink-0 rounded-full border-2 border-foreground bg-card text-foreground disabled:opacity-40 disabled:pointer-events-none"
      : "grid place-items-center size-9 shrink-0 rounded-[11px] bg-card border border-border/70 hover:bg-muted transition shadow-sm disabled:opacity-40 disabled:pointer-events-none";

  return (
    <button
      type="button"
      onClick={() => router.back()}
      disabled={!canGoBack}
      aria-label="Kembali ke halaman sebelumnya"
      title="Kembali ke halaman sebelumnya"
      className={className}
    >
      <ArrowLeft size={16} strokeWidth={2} />
    </button>
  );
}
