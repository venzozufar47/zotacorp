"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { setLocationEmployees } from "@/lib/actions/location.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface EmployeeOption {
  id: string;
  full_name: string | null;
  email: string;
}

interface Props {
  /** Null = dialog closed. Object = open, editing that location. */
  target: {
    id: string;
    name: string;
    assigned_employee_ids: string[];
  } | null;
  allEmployees: EmployeeOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * Inverse of `LocationAssignmentDialog` — this one lets the admin pick
 * which employees are assigned to a given location, from the Locations
 * tab. Mirrors the same diff-based save semantics so opening / closing
 * is cheap and side-effect-free.
 */
export function LocationEmployeesDialog({
  target,
  allEmployees,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const tl = t.adminLocations;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (target) setSelected(new Set(target.assigned_employee_ids));
  }, [target]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSave() {
    if (!target) return;
    const locationId = target.id;
    startTransition(async () => {
      const result = await setLocationEmployees(locationId, [...selected]);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(tl.employeesSavedToast);
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{tl.employeesDialogTitle}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{target?.name}</span>
            {" — "}
            {tl.employeesDialogSubtitle}
          </DialogDescription>
        </DialogHeader>

        {allEmployees.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">
            {tl.employeesDialogEmpty}
          </p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto -mx-1 px-1">
            {allEmployees.map((e) => (
              <label
                key={e.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 border-border hover:bg-muted hover:border-foreground/40 cursor-pointer transition-all"
              >
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={() => toggle(e.id)}
                  className="w-5 h-5 rounded border-2 border-foreground accent-primary"
                />
                <User size={14} strokeWidth={2.5} className="text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.full_name || e.email}</div>
                  {e.full_name && (
                    <div className="text-xs text-muted-foreground truncate">
                      {e.email}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending} loading={pending}>
            {tl.cancel}
          </Button>
          <Button onClick={onSave} disabled={pending || allEmployees.length === 0}>
            {pending ? tl.saving : tl.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
