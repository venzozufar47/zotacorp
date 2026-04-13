import { Card, CardContent } from "@/components/ui/card";
import { Clock, CheckCircle, AlertCircle, Timer, Calendar } from "lucide-react";
import { formatMinutesHuman } from "@/lib/utils/date";

interface AttendanceSummaryCardProps {
  summary: {
    totalWorkingHours: number;
    onTimeCount: number;
    lateCount: number;
    lateExcusedCount: number;
    flexibleCount: number;
    approvedOvertimeMinutes: number;
    totalDays: number;
  };
  monthLabel: string;
}

export function AttendanceSummaryCard({
  summary,
  monthLabel,
}: AttendanceSummaryCardProps) {
  const totalHours = Math.floor(summary.totalWorkingHours);
  const totalMins = Math.round((summary.totalWorkingHours - totalHours) * 60);
  const totalLabel = totalHours > 0
    ? `${totalHours}h ${totalMins}m`
    : `${totalMins}m`;

  const overtimeLabel = summary.approvedOvertimeMinutes > 0
    ? formatMinutesHuman(summary.approvedOvertimeMinutes)
    : "0";

  const stats = [
    {
      label: "Total Hours",
      value: totalLabel,
      icon: Clock,
      color: "var(--primary)",
      bg: "var(--accent)",
    },
    {
      label: "On Time",
      value: summary.onTimeCount.toString(),
      icon: CheckCircle,
      color: "#34c759",
      bg: "#f0fdf4",
    },
    {
      label: "Late",
      value: summary.lateCount.toString(),
      icon: AlertCircle,
      color: "#ff3b30",
      bg: "#fef2f2",
    },
    {
      label: "Overtime",
      value: overtimeLabel,
      icon: Timer,
      color: "#3b82f6",
      bg: "#eff6ff",
    },
    {
      label: "Days",
      value: summary.totalDays.toString(),
      icon: Calendar,
      color: "#8b5cf6",
      bg: "#f5f3ff",
    },
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          {monthLabel} Summary
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {stats.map(({ label, value, icon: Icon, color, bg }) => (
            <div
              key={label}
              className="rounded-xl p-3 text-center"
              style={{ background: bg }}
            >
              <Icon size={16} className="mx-auto mb-1" style={{ color }} />
              <p className="text-lg font-bold" style={{ color }}>
                {value}
              </p>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {label}
              </p>
            </div>
          ))}
        </div>
        {summary.lateExcusedCount > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {summary.lateExcusedCount} late arrival{summary.lateExcusedCount !== 1 ? "s" : ""} excused with proof
          </p>
        )}
      </CardContent>
    </Card>
  );
}
