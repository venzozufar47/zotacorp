"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setEmployeeLocations } from "@/lib/actions/location.actions";

interface LocationOption {
  id: string;
  name: string;
}

interface Props {
  employeeId: string;
  allLocations: LocationOption[];
  initialAssignedIds: string[];
}

/**
 * Admin-only multi-select for an employee's assigned attendance locations.
 *
 * Empty selection = unrestricted (matches the documented rule: employees
 * with no assignments can check in/out anywhere). Saving fires a diff-based
 * update so we don't churn unchanged rows.
 */
export function EmployeeLocationAssignment({
  employeeId,
  allLocations,
  initialAssignedIds,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialAssignedIds)
  );
  const [pending, startTransition] = useTransition();

  const isDirty =
    selected.size !== initialAssignedIds.length ||
    initialAssignedIds.some((id) => !selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSave() {
    startTransition(async () => {
      const result = await setEmployeeLocations(employeeId, [...selected]);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Assignment lokasi disimpan.");
    });
  }

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card shadow-hard p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full border-2 border-foreground flex items-center justify-center flex-shrink-0 bg-quaternary">
          <MapPin size={18} strokeWidth={2.5} className="text-foreground" />
        </div>
        <div>
          <h3 className="font-display font-bold text-lg">Lokasi kerja</h3>
          <p className="text-xs text-muted-foreground mt-0.5 font-medium">
            Pilih lokasi yang boleh dipakai untuk check in. Kosongkan = bebas check in di mana saja.
          </p>
        </div>
      </div>

      {allLocations.length === 0 ? (
        <p className="text-sm text-muted-foreground italic font-medium">
          Belum ada lokasi terdaftar. Tambahkan dulu di tab Lokasi.
        </p>
      ) : (
        <div className="space-y-2">
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
              <span className="text-sm font-medium">{loc.name}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={!isDirty || pending}>
          {pending ? "Menyimpan…" : "Simpan assignment"}
        </Button>
      </div>
    </section>
  );
}
