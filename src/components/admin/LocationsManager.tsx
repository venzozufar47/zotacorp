"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { LocationFormDialog, type LocationFormValue } from "./LocationFormDialog";
import { LocationEmployeesDialog } from "./LocationEmployeesDialog";
import { deleteLocation } from "@/lib/actions/location.actions";
import { useTranslation } from "@/lib/i18n/LanguageProvider";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { sortRows, type SortDir } from "@/lib/utils/sort";

interface LocationRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  assigned_count: number;
  /** Employee ids currently assigned to this location. Used to pre-tick
   *  the employee picker dialog. */
  assigned_employee_ids: string[];
}

interface EmployeeOption {
  id: string;
  full_name: string | null;
  email: string;
}

interface Props {
  initialLocations: LocationRow[];
  allEmployees: EmployeeOption[];
}

type LocSortKey = "name" | "radius_m" | "assigned_count";

export function LocationsManager({ initialLocations, allEmployees }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const tl = t.adminLocations;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LocationFormValue | undefined>(undefined);
  const [editingEmployees, setEditingEmployees] = useState<LocationRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LocationRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [sortKey, setSortKey] = useState<LocSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: LocSortKey) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const accessors: Record<LocSortKey, (r: LocationRow) => string | number> = {
    name: (r) => r.name,
    radius_m: (r) => r.radius_m,
    assigned_count: (r) => r.assigned_count,
  };

  const displayRows = sortKey
    ? sortRows(initialLocations, accessors[sortKey], sortDir)
    : initialLocations;

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(row: LocationRow) {
    setEditing({
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      radius_m: row.radius_m,
    });
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    startTransition(async () => {
      const result = await deleteLocation(target.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(tl.deletedToast.replace("{name}", target.name));
      setPendingDelete(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus size={14} className="mr-1.5" />
          {tl.addCta}
        </Button>
      </div>

      {initialLocations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center bg-white">
          <MapPin size={32} className="mx-auto mb-3 text-muted-foreground/50" />
          <h3 className="font-medium text-foreground mb-1">{tl.emptyTitle}</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {tl.emptyDescription}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-foreground/6 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">
                  <SortBtn label={tl.colName} k="name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                </th>
                <th className="px-4 py-3 font-medium">{tl.colCoords}</th>
                <th className="px-4 py-3 font-medium">
                  <SortBtn label={tl.colRadius} k="radius_m" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortBtn label={tl.colEmployees} k="assigned_count" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                </th>
                <th className="px-4 py-3 font-medium text-right">{tl.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayRows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    <a
                      href={`https://www.google.com/maps/@${row.latitude},${row.longitude},17z`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {row.latitude}, {row.longitude}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {row.radius_m} m
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setEditingEmployees(row)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-[#f5f5f7] hover:text-foreground hover:border-foreground/20 transition-colors"
                      aria-label={tl.employeesDialogTitle}
                    >
                      {row.assigned_count} {tl.employeeSuffix}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(row)}
                        aria-label={`${tl.ariaEdit} ${row.name}`}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setPendingDelete(row)}
                        aria-label={`${tl.ariaDelete} ${row.name}`}
                        className="hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LocationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSaved={() => router.refresh()}
      />

      <LocationEmployeesDialog
        target={
          editingEmployees
            ? {
                id: editingEmployees.id,
                name: editingEmployees.name,
                assigned_employee_ids: editingEmployees.assigned_employee_ids,
              }
            : null
        }
        allEmployees={allEmployees}
        onOpenChange={(o) => !o && setEditingEmployees(null)}
        onSaved={() => {
          setEditingEmployees(null);
          router.refresh();
        }}
      />

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tl.deleteTitle}</DialogTitle>
            <DialogDescription>
              {tl.deleteBodyPrefix}{" "}
              <span className="font-medium">{pendingDelete?.name}</span>{" "}
              {pendingDelete && pendingDelete.assigned_count > 0 && (
                <span className="text-destructive">
                  ({pendingDelete.assigned_count} {tl.deleteWarnCountSuffix}){" "}
                </span>
              )}
              {tl.deleteBodySuffix}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={pending}
            >
              {tl.cancel}
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={pending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? tl.deleting : tl.deleteCta}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Lightweight sort-header button for this table — the outer <th> here
 * isn't a shadcn TableHead so we can't reuse the generic SortableHeader
 * component, but the UX is identical.
 */
function SortBtn({
  label,
  k,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  k: LocSortKey;
  sortKey: LocSortKey | null;
  sortDir: SortDir;
  onToggle: (k: LocSortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <button
      type="button"
      onClick={() => onToggle(k)}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      aria-sort={!active ? "none" : sortDir === "asc" ? "ascending" : "descending"}
    >
      {label}
      {active ? (
        sortDir === "asc" ? (
          <ArrowUp size={12} className="text-foreground" />
        ) : (
          <ArrowDown size={12} className="text-foreground" />
        )
      ) : (
        <ArrowUpDown size={12} className="opacity-30" />
      )}
    </button>
  );
}
