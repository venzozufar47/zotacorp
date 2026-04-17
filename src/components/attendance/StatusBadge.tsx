"use client";

import { Badge } from "@/components/ui/badge";
import { formatMinutesHuman } from "@/lib/utils/date";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface StatusBadgeProps {
  status: string;
  lateMinutes?: number;
}

type StatusKey = "on_time" | "late" | "late_excused" | "flexible" | "unknown";

const STATUS_VARIANT: Record<StatusKey, "quaternary" | "destructive" | "tertiary" | "muted" | "outline"> = {
  on_time: "quaternary",
  late: "destructive",
  late_excused: "tertiary",
  flexible: "muted",
  unknown: "outline",
};

export function StatusBadge({ status, lateMinutes }: StatusBadgeProps) {
  const { t } = useTranslation();
  const key = (status in STATUS_VARIANT ? status : "unknown") as StatusKey;
  const variant = STATUS_VARIANT[key];
  const labelMap: Record<StatusKey, string> = {
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
    <Badge variant={variant} className="shrink-0">
      {label}
    </Badge>
  );
}
