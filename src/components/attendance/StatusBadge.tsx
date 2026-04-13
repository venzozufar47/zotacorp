import { Badge } from "@/components/ui/badge";
import { formatMinutesHuman } from "@/lib/utils/date";

interface StatusBadgeProps {
  status: string;
  lateMinutes?: number;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  on_time: { bg: "#f0fdf4", color: "#15803d", label: "On Time" },
  late: { bg: "#fef2f2", color: "#b91c1c", label: "Late" },
  late_excused: { bg: "#fefce8", color: "#92400e", label: "Late (Excused)" },
  flexible: { bg: "#f5f5f7", color: "#525252", label: "Flexible" },
  unknown: { bg: "#f5f5f7", color: "#525252", label: "—" },
};

export function StatusBadge({ status, lateMinutes }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;

  const label =
    status === "late" && lateMinutes
      ? `Late (${formatMinutesHuman(lateMinutes)})`
      : style.label;

  return (
    <Badge
      className="text-xs px-2 shrink-0"
      style={{ background: style.bg, color: style.color, border: "none" }}
    >
      {label}
    </Badge>
  );
}
