"use client";

import { useState } from "react";
import { ListChecks, UserCheck, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChecklistManager } from "./ChecklistManager";
import { AssignmentManager } from "./AssignmentManager";
import { CleaningMonitor } from "./CleaningMonitor";
import type {
  CleaningChecklist,
  CleaningAssignmentRow,
  MonitorRow,
} from "@/lib/actions/cleaning.actions";

export interface CleaningEmployee {
  id: string;
  name: string;
  business_unit: string | null;
}

type Tab = "monitor" | "checklists" | "assignments";

const TABS: { key: Tab; label: string; icon: typeof ListChecks }[] = [
  { key: "monitor", label: "Monitoring", icon: BarChart3 },
  { key: "checklists", label: "Checklist", icon: ListChecks },
  { key: "assignments", label: "Assignment", icon: UserCheck },
];

export function CleaningAdmin({
  checklists,
  assignments,
  monitor,
  employees,
}: {
  checklists: CleaningChecklist[];
  assignments: CleaningAssignmentRow[];
  monitor: { date: string; holiday: string | null; rows: MonitorRow[] };
  employees: CleaningEmployee[];
}) {
  const [tab, setTab] = useState<Tab>("monitor");

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition border",
              tab === key
                ? "bg-primary text-primary-foreground border-foreground"
                : "bg-card text-foreground/70 border-border hover:bg-muted"
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === "monitor" && <CleaningMonitor initial={monitor} />}
      {tab === "checklists" && <ChecklistManager initial={checklists} />}
      {tab === "assignments" && (
        <AssignmentManager
          initial={assignments}
          checklists={checklists}
          employees={employees}
        />
      )}
    </div>
  );
}
