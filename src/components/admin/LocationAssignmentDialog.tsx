"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { setEmployeeLocations } from "@/lib/actions/location.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";

interface LocationOption {
  id: string;
  name: string;
}

interface Props {
  target: {
    id: string;
    full_name: string;
    email: string;
    assigned_location_ids: string[];
  } | null;
  allLocations: LocationOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * Inline dialog for editing an employee's assigned locations straight from
 * the users table, so admins don't have to drill into the detail page for
 * every change. Mirrors the logic of the card-style assignment component
 * on the detail page — same `setEmployeeLocations` action, same diff-based
 * save — but dialog-shaped and reset per-target.
 */
export function LocationAssignmentDialog({
  target,
  allLocations,
  onOpenChange,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const tu = t.adminUsers;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (target) setSelected(new Set(target.assigned_location_ids));
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
    const employeeId = target.id;
    startTransition(async () => {
      const result = await setEmployeeLocations(employeeId, [...selected]);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(tu.locAssignSavedToast);
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{tu.locAssignTitle}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">
              {target?.full_name || target?.email}
            </span>
            {" — "}
            {tu.locAssignSubtitle}
          </DialogDescription>
        </DialogHeader>

        {allLocations.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">
            {tu.locAssignEmpty}
          </p>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
            {allLocations.map((loc) => (
              <label
                key={loc.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 border-border hover:bg-muted hover:border-foreground/40 cursor-pointer transition-all"
              >
                <input
                  type="checkbox"
                  checked={selected.has(loc.id)}
                  onChange={() => toggle(loc.id)}
                  className="w-5 h-5 rounded border-2 border-foreground accent-primary"
                />
                <MapPin size={14} strokeWidth={2.5} className="text-muted-foreground" />
                <span className="text-sm font-medium">{loc.name}</span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tu.locAssignCancel}
          </Button>
          <Button onClick={onSave} disabled={pending || allLocations.length === 0}>
            {pending ? tu.locAssignSaving : tu.locAssignSave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
