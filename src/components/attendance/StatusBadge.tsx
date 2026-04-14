"use client";

import { Badge } from "@/components/ui/badge";
import { formatMinutesHuman } from "@/lib/utils/date";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface StatusBadgeProps {
  status: string;
  lateMinutes?: number;
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  on_time: { bg: "#f0fdf4", color: "#15803d" },
  late: { bg: "#fef2f2", color: "#b91c1c" },
  late_excused: { bg: "#fefce8", color: "#92400e" },
  flexible: { bg: "#f5f5f7", color: "#525252" },
  unknown: { bg: "#f5f5f7", color: "#525252" },
};

export function StatusBadge({ status, lateMinutes }: StatusBadgeProps) {
  const { t } = useTranslation();
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;
  const key = (status in STATUS_STYLES ? status : "unknown") as
    | "on_time"
    | "late"
    | "late_excused"
    | "flexible"
    | "unknown";
  const labelMap: Record<typeof key, string> = {
    on_time: t.statusBadge.onTime,
    late: t.statusBadge.late,
    late_excused: t.statusBadge.lateExcused,
    flexible: t.statusBadge.flexible,
    unknown: t.statusBadge.unknown,
  };

  const label =
    status === "late" && lateMinutes
      ? `${t.statusBadge.late} (${formatMinutesHuman(lateMinutes, t.units)})`
      : labelMap[key];

  return (
    <Badge
      className="text-xs px-2 shrink-0"
      style={{ background: style.bg, color: style.color, border: "none" }}
    >
      {label}
    </Badge>
  );
}
