import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
  lateMinutes?: number;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  on_time: { bg: "#f0fdf4", color: "#34c759", label: "On Time" },
  late: { bg: "#fef2f2", color: "#ff3b30", label: "Late" },
  late_excused: { bg: "#fefce8", color: "#ca8a04", label: "Late (Excused)" },
  flexible: { bg: "#f5f5f7", color: "#6e6e73", label: "Flexible" },
  unknown: { bg: "#f5f5f7", color: "#6e6e73", label: "—" },
};

export function StatusBadge({ status, lateMinutes }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;

  const label =
    status === "late" && lateMinutes
      ? `Late (${lateMinutes} min)`
      : style.label;

  return (
    <Badge
      className="text-[10px] px-2 shrink-0"
      style={{ background: style.bg, color: style.color, border: "none" }}
    >
      {label}
    </Badge>
  );
}
