"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setEmployeeLocations } from "@/lib/actions/location.actions";
import { Button } from "@/components/ui/button";
import { Panel } from "./Panel";

/** Lokasi absen: ringkasan dulu, daftar centang dibuka lewat "Ubah". */
export function LocationPanel({
  employeeId,
  allLocations,
  initialIds,
}: {
  employeeId: string;
  allLocations: { id: string; name: string }[];
  initialIds: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(new Set(initialIds));
  const [pending, start] = useTransition();
  const names = allLocations.filter((l) => initialIds.includes(l.id)).map((l) => l.name);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    start(async () => {
      const res = await setEmployeeLocations(employeeId, [...selected]);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Lokasi absen disimpan");
      setEditing(false);
      router.refresh();
    });
  }

  function cancel() {
    setSelected(new Set(initialIds));
    setEditing(false);
  }

  return (
    <Panel
      title="Lokasi absen"
      hint="Kosong berarti boleh absen di mana saja."
      action={
        !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Ubah
          </Button>
        )
      }
    >
      {!editing ? (
        <p className="text-sm text-foreground">{names.length ? names.join(", ") : "Bebas lokasi"}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-1 sm:grid-cols-2">
            {allLocations.map((l) => (
              <label
                key={l.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selected.has(l.id)}
                  onChange={() => toggle(l.id)}
                  className="size-4 accent-primary"
                />
                {l.name}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={cancel} disabled={pending}>
              Batal
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
