import { Clock, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AttendanceLog } from "@/lib/supabase/types";
import {
  formatTime,
  getDurationHours,
  getDurationHoursDecimal,
  formatMinutesHuman,
} from "@/lib/utils/date";
import { StatusBadge } from "./StatusBadge";

interface AttendanceStatusCardProps {
  log: AttendanceLog | null;
  timezone?: string;
}

export function AttendanceStatusCard({ log, timezone }: AttendanceStatusCardProps) {
  if (!log) return null;

  const isOpen = !log.checked_out_at;
  const hours = getDurationHoursDecimal(log.checked_in_at, log.checked_out_at);

  const overtimeLabel = log.overtime_status === "approved"
    ? "approved"
    : log.overtime_status === "rejected"
    ? "rejected"
    : "pending";

  return (
    <Card className="border-0 shadow-sm" style={{ background: "var(--accent)" }}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--primary)" }}
              >
                Today
              </p>
              <StatusBadge status={log.status} lateMinutes={log.late_minutes} />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm">
                <Clock size={14} style={{ color: "var(--primary)" }} />
                <span className="font-semibold">
                  {formatTime(log.checked_in_at, timezone)}
                </span>
                {log.checked_out_at && (
                  <>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-semibold">
                      {formatTime(log.checked_out_at, timezone)}
                    </span>
                  </>
                )}
              </div>
            </div>
            {log.checked_out_at && (
              <p className="text-xs text-muted-foreground">
                {getDurationHours(log.checked_in_at, log.checked_out_at)} worked
                {log.is_overtime && log.overtime_minutes > 0 && (
                  <span className="ml-1" style={{
                    color: overtimeLabel === "approved" ? "#34c759"
                      : overtimeLabel === "rejected" ? "#ff3b30"
                      : "var(--primary)"
                  }}>
                    · {formatMinutesHuman(log.overtime_minutes)} overtime ({overtimeLabel})
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="text-right">
            {isOpen ? (
              <span
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: "#fff7ed", color: "#ff9f0a" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff9f0a] animate-pulse" />
                In progress
              </span>
            ) : (
              <div className="text-right">
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ background: "#f0fdf4", color: "#34c759" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#34c759]" />
                  Complete
                </span>
                <p
                  className="text-lg font-bold mt-1"
                  style={{ color: "var(--primary)" }}
                >
                  {hours}h
                </p>
              </div>
            )}
            {log.latitude && (
              <a
                href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs mt-1 justify-end"
                style={{ color: "var(--primary)" }}
              >
                <MapPin size={12} />
                View location
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
