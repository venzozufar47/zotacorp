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
  const totalLabel =
    totalHours > 0 ? `${totalHours}h ${totalMins}m` : `${totalMins}m`;

  const overtimeLabel =
    summary.approvedOvertimeMinutes > 0
      ? formatMinutesHuman(summary.approvedOvertimeMinutes)
      : "0";

  const stats = [
    {
      label: "Total Hours",
      value: totalLabel,
      icon: Clock,
      bg: "bg-primary",
      text: "text-primary-foreground",
    },
    {
      label: "On Time",
      value: summary.onTimeCount.toString(),
      icon: CheckCircle,
      bg: "bg-quaternary",
      text: "text-foreground",
    },
    {
      label: "Late",
      value: summary.lateCount.toString(),
      icon: AlertCircle,
      bg: "bg-destructive",
      text: "text-white",
    },
    {
      label: "Overtime",
      value: overtimeLabel,
      icon: Timer,
      bg: "bg-tertiary",
      text: "text-foreground",
    },
    {
      label: "Days",
      value: summary.totalDays.toString(),
      icon: Calendar,
      bg: "bg-pop-pink",
      text: "text-foreground",
    },
  ];

  return (
    <Card>
      <CardContent>
        <p className="font-display text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground mb-4">
          {monthLabel} Summary
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {stats.map(({ label, value, icon: Icon, bg, text }) => (
            <div
              key={label}
              className={`rounded-2xl border-2 border-foreground p-3 text-center shadow-hard-sm ${bg} ${text}`}
            >
              <span className="inline-flex items-center justify-center size-8 rounded-full border-2 border-foreground bg-background/80 mx-auto mb-1.5">
                <Icon size={14} strokeWidth={2.5} className="text-foreground" />
              </span>
              <p className="font-display text-xl font-extrabold leading-tight">
                {value}
              </p>
              <p className="font-display text-[0.625rem] font-bold uppercase tracking-wider opacity-80 mt-0.5">
                {label}
              </p>
            </div>
          ))}
        </div>
        {summary.lateExcusedCount > 0 && (
          <p className="text-xs text-muted-foreground mt-3 font-medium">
            {summary.lateExcusedCount} late arrival
            {summary.lateExcusedCount !== 1 ? "s" : ""} excused with proof
          </p>
        )}
      </CardContent>
    </Card>
  );
}
