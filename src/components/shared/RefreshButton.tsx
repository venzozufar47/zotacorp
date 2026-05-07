"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

interface Props {
  /** Optional override label shown on sm+ screens. */
  label?: string;
  /** Visual size of the button — defaults to "sm" matching toolbar links. */
  className?: string;
}

/**
 * Small client wrapper around `router.refresh()` so a server-component
 * page can give the user a manual reload affordance without a full
 * browser refresh. Spinner runs while the transition is pending so
 * fast networks still get visible feedback.
 */
export function RefreshButton({
  label = "Refresh",
  className = "inline-flex items-center gap-1.5 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60",
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className={className}
      aria-label={label}
    >
      <RefreshCw
        size={14}
        strokeWidth={2.5}
        className={pending ? "animate-spin" : undefined}
      />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
