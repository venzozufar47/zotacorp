"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { PendingConfirmationsBell } from "./PendingConfirmationsBell";
import type { PendingConfirmationItem } from "@/lib/actions/pending-confirmations.actions";

/**
 * Admin top bar — Shell A.
 *
 * Layout: breadcrumbs (left) · spacer · date pill · refresh · bell · quick action.
 * Quick action is a placeholder (no dropdown wiring yet — kept as visual cue).
 */
export function AdminTopbar({
  pendingConfirmations,
}: {
  pendingConfirmations: PendingConfirmationItem[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();

  const crumbs = useMemo(() => deriveCrumbs(pathname), [pathname]);
  const dateLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, []);

  return (
    <div
      className="hidden md:flex h-[60px] items-center gap-3.5 px-7 border-b border-border/70 sticky top-0 z-30"
      style={{
        background: "rgba(251, 251, 249, 0.7)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-muted-foreground/50" aria-hidden>
                /
              </span>
            )}
            <span
              className={
                i === crumbs.length - 1
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              }
            >
              {c}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        <span className="hidden lg:inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-card border border-border/70 text-[11.5px] font-medium text-foreground/80 shadow-sm">
          {dateLabel}
        </span>
        <button
          type="button"
          onClick={() => startRefresh(() => router.refresh())}
          className="grid place-items-center size-9 rounded-[11px] bg-card border border-border/70 hover:bg-muted transition shadow-sm disabled:opacity-60"
          disabled={refreshing}
          title="Refresh"
        >
          <RefreshCw
            size={15}
            className={refreshing ? "animate-spin" : ""}
            strokeWidth={1.8}
          />
        </button>
        <PendingConfirmationsBell
          items={pendingConfirmations}
          variant="compact"
        />
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12.5px] font-medium text-white shadow-sm transition hover:brightness-110"
          style={{
            background: "var(--grad-teal)",
            boxShadow: "0 2px 10px rgba(17, 122, 140, 0.32)",
          }}
          title="Quick action"
        >
          <Sparkles size={13} strokeWidth={1.8} />
          <span>Quick</span>
        </button>
      </div>
    </div>
  );
}

function deriveCrumbs(pathname: string): string[] {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0 || segs[0] !== "admin") return ["Admin"];
  if (segs.length === 1) return ["Admin", "Home"];
  const labelMap: Record<string, string> = {
    attendance: "Attendance",
    payslips: "Payslips",
    variables: "Variables",
    users: "Users",
    locations: "Locations",
    finance: "Finance",
    celebrations: "Celebrations",
    settings: "Settings",
  };
  return [
    "Admin",
    ...segs.slice(1).map((s) => labelMap[s] ?? capitalize(s)),
  ];
}

function capitalize(s: string) {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
