import { Clock, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import type { AttendanceMonthSummary } from "@/lib/actions/attendance.actions";

/**
 * 4-card metric strip rendered above the Recap table. Each card has a
 * 3 px Lagoon top accent bar (teal / teal / warn / bad) per the design.
 */
export function AttendanceSummaryCards({
  summary,
}: {
  summary: AttendanceMonthSummary;
}) {
  const cards: Array<{
    label: string;
    value: string;
    frac?: string;
    sub: string;
    accent: "teal" | "warn" | "bad";
    icon: typeof Clock;
  }> = [
    {
      label: "Logged hours",
      value: new Intl.NumberFormat("en-US").format(summary.loggedHours),
      frac: "h",
      sub: `${summary.totalLogs} logs this month`,
      accent: "teal",
      icon: Clock,
    },
    {
      label: "On-time rate",
      value: `${Math.round(summary.onTimeRate * 100)}`,
      frac: "%",
      sub:
        summary.totalLogs === 0
          ? "no data yet"
          : `${Math.round(summary.onTimeRate * summary.totalLogs)} of ${summary.totalLogs} on time`,
      accent: "teal",
      icon: CheckCircle2,
    },
    {
      label: "Late incidents",
      value: `${summary.lateCount}`,
      sub: "across all employees",
      accent: "warn",
      icon: AlertTriangle,
    },
    {
      label: "Approved late",
      value: `${summary.approvedLateCount}`,
      sub:
        summary.lateCount === 0
          ? "no late incidents yet"
          : `${summary.lateCount - summary.approvedLateCount} pending review`,
      accent: "teal",
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className="relative bg-card rounded-2xl border border-border/70 px-4 sm:px-5 py-4 overflow-hidden"
            style={{
              boxShadow:
                "0 1px 2px rgba(8, 49, 46, 0.04), 0 4px 16px rgba(8, 49, 46, 0.05)",
            }}
          >
            <span
              className="absolute top-0 inset-x-0 h-[3px]"
              style={{
                background:
                  c.accent === "teal"
                    ? "var(--teal-400)"
                    : c.accent === "warn"
                      ? "var(--warning, #ff9f0a)"
                      : "var(--destructive, #ff3b30)",
              }}
              aria-hidden
            />
            <div className="flex items-center gap-2 mb-3">
              <span
                className="grid place-items-center size-[22px] rounded-md"
                style={{
                  background:
                    c.accent === "teal"
                      ? "var(--accent)"
                      : c.accent === "warn"
                        ? "rgba(255,159,10,0.15)"
                        : "rgba(255,59,48,0.15)",
                  color:
                    c.accent === "teal"
                      ? "var(--teal-600)"
                      : c.accent === "warn"
                        ? "var(--warning, #ff9f0a)"
                        : "var(--destructive, #ff3b30)",
                }}
              >
                <Icon size={13} strokeWidth={1.8} />
              </span>
              <span className="text-[10.5px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {c.label}
              </span>
            </div>
            <div className="font-display font-semibold leading-none tracking-[-0.025em] text-foreground tabular-nums text-2xl sm:text-3xl lg:text-[32px]">
              {c.value}
              {c.frac && (
                <span className="text-muted-foreground font-medium text-base sm:text-lg lg:text-xl ml-0.5">
                  {c.frac}
                </span>
              )}
            </div>
            <div className="text-[11.5px] text-muted-foreground mt-1.5 truncate">
              {c.sub}
            </div>
          </div>
        );
      })}
    </div>
  );
}
