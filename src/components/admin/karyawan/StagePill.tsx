import { cn } from "@/lib/utils";
import { STAGE_LABEL, type EmployeeStage } from "@/lib/employees/lifecycle";

const TONE: Record<EmployeeStage, string> = {
  baru: "bg-primary/10 text-primary",
  probation: "bg-warning/15 text-foreground",
  aktif: "bg-success/15 text-foreground",
  pamit: "bg-destructive/10 text-destructive",
  keluar: "bg-muted text-muted-foreground",
};

const DOT: Record<EmployeeStage, string> = {
  baru: "bg-primary",
  probation: "bg-warning",
  aktif: "bg-success",
  pamit: "bg-destructive",
  keluar: "bg-muted-foreground/50",
};

export function StagePill({ stage, className }: { stage: EmployeeStage; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE[stage],
        className
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", DOT[stage])} />
      {STAGE_LABEL[stage]}
    </span>
  );
}
