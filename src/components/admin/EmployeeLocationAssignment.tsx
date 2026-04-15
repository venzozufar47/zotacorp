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
    <section className="rounded-2xl bg-white ring-1 ring-foreground/6 p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--accent)", color: "var(--primary)" }}
        >
          <MapPin size={18} />
        </div>
        <div>
          <h3 className="font-display font-semibold text-base">Lokasi kerja</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pilih lokasi yang boleh dipakai untuk check in. Kosongkan = bebas check in di mana saja.
          </p>
        </div>
      </div>

      {allLocations.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Belum ada lokasi terdaftar. Tambahkan dulu di tab Lokasi.
        </p>
      ) : (
        <div className="space-y-2">
          {allLocations.map((loc) => (
            <label
              key={loc.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(loc.id)}
                onChange={() => toggle(loc.id)}
                className="w-4 h-4 rounded accent-[var(--primary)]"
              />
              <span className="text-sm">{loc.name}</span>
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
