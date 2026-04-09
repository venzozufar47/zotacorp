"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error.message, "digest:", error.digest);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] px-4">
      <div className="text-center max-w-sm">
        <span className="text-5xl block mb-4">⚠️</span>
        <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
        <p className="text-muted-foreground text-sm mb-1">
          {error.message?.includes("NEXT_PUBLIC_SUPABASE")
            ? "Missing Supabase environment variables."
            : "A server error occurred. Please try again."}
        </p>
        {error.digest && (
          <p className="text-xs font-mono bg-black/5 rounded px-2 py-1 inline-block mb-4">
            {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            onClick={reset}
            className="text-sm font-medium px-4 py-2 rounded-xl text-white"
            style={{ background: "var(--primary)" }}
          >
            Try again
          </button>
          <a
            href="/login"
            className="text-sm text-muted-foreground underline"
          >
            Go to login
          </a>
        </div>
      </div>
    </div>
  );
}
