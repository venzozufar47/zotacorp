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
    <div className="min-h-screen flex items-center justify-center bg-background bg-dots-light px-4">
      <div className="text-center max-w-sm relative">
        <div className="inline-flex items-center justify-center size-20 rounded-full border-2 border-foreground bg-tertiary shadow-hard mb-5 animate-pop-in">
          <span className="text-4xl">⚠️</span>
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight mb-2">
          Something went wrong<span className="text-primary">.</span>
        </h1>
        <p className="text-muted-foreground text-sm mb-2 font-medium">
          {error.message?.includes("NEXT_PUBLIC_SUPABASE")
            ? "Missing Supabase environment variables."
            : "A server error occurred. Please try again."}
        </p>
        {error.digest && (
          <p className="text-xs font-mono bg-muted border-2 border-border rounded-full px-3 py-1 inline-block mb-4">
            {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-2.5 mt-4">
          <button
            onClick={reset}
            className="font-display font-bold text-sm h-11 px-6 rounded-full border-2 border-foreground bg-primary text-primary-foreground shadow-hard hover:-translate-y-0.5 hover:shadow-hard-hover transition-all"
          >
            Try again
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
