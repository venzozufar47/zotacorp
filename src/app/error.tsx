"use client";

import { useEffect } from "react";

/** Error yang muncul karena deploy baru (client tab lama) — server action
 *  ID atau chunk JS tak lagi ada. Satu-satunya recovery = muat ulang penuh
 *  supaya browser mengambil bundle deploy terbaru. `reset()` tidak cukup
 *  karena code client-nya masih versi lama. */
function looksLikeStaleDeployment(error: Error): boolean {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return /Failed to find Server Action|older or newer deployment|ChunkLoadError|Loading chunk|dynamically imported module/i.test(
    msg
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error.message, "digest:", error.digest);
    // Auto-recover dari deployment skew, tapi jaga jangan sampai loop:
    // hanya sekali per ~20 detik.
    if (looksLikeStaleDeployment(error) && typeof window !== "undefined") {
      try {
        const KEY = "zota:autoReloadAt";
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last > 20000) {
          sessionStorage.setItem(KEY, String(Date.now()));
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    }
  }, [error]);

  const stale = looksLikeStaleDeployment(error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background bg-dots-light px-4">
      <div className="text-center max-w-sm relative">
        <div className="inline-flex items-center justify-center size-20 rounded-full border-2 border-foreground bg-tertiary shadow-hard mb-5 animate-pop-in">
          <span className="text-4xl">⚠️</span>
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight mb-2">
          {stale ? (
            <>Aplikasi diperbarui<span className="text-primary">.</span></>
          ) : (
            <>Something went wrong<span className="text-primary">.</span></>
          )}
        </h1>
        <p className="text-muted-foreground text-sm mb-2 font-medium">
          {stale
            ? "Ada versi baru aplikasi. Memuat ulang halaman…"
            : error.message?.includes("NEXT_PUBLIC_SUPABASE")
              ? "Missing Supabase environment variables."
              : "A server error occurred. Please try again."}
        </p>
        {error.digest && !stale && (
          <p className="text-xs font-mono bg-muted border-2 border-border rounded-full px-3 py-1 inline-block mb-4">
            {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-2.5 mt-4">
          {/* Hard reload lebih andal daripada reset() untuk error deploy
              skew (server action / chunk) — ambil bundle terbaru. */}
          <button
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
              else reset();
            }}
            className="font-display font-bold text-sm h-11 px-6 rounded-full border-2 border-foreground bg-primary text-primary-foreground shadow-hard hover:-translate-y-0.5 hover:shadow-hard-hover transition-all"
          >
            Muat ulang
          </button>
          <a
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 font-medium"
          >
            Go to login
          </a>
        </div>
      </div>
    </div>
  );
}
