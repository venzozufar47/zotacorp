"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createEmployeeBranchEntry,
  updateEmployeeBranchEntry,
  deleteEmployeeBranchEntry,
  type EmployeeBranchRow,
} from "@/lib/actions/employee-branch-map.actions";
import { getCategoryPresets } from "@/lib/cashflow/categories";

interface Props {
  rows: EmployeeBranchRow[];
  businessUnits: string[];
}

export function EmployeeBranchMapClient({ rows, businessUnits }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBranch, setEditBranch] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [newBU, setNewBU] = useState(businessUnits[0] ?? "Yeobo Space");
  const [newName, setNewName] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const presetsForBU = (bu: string) =>
    getCategoryPresets(bu).branches.concat(["Needs Assignment"]);

  const handleStartEdit = (r: EmployeeBranchRow) => {
    setEditingId(r.id);
    setEditName(r.nameKeyword);
    setEditBranch(r.branch);
    setEditNotes(r.notes ?? "");
  };

  const handleSaveEdit = (r: EmployeeBranchRow) => {
    startTransition(async () => {
      const res = await updateEmployeeBranchEntry(r.id, {
        nameKeyword: editName,
        branch: editBranch,
        notes: editNotes || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tersimpan");
      setEditingId(null);
      router.refresh();
    });
  };

  const handleDelete = (r: EmployeeBranchRow) => {
    if (!confirm(`Hapus "${r.nameKeyword}" → ${r.branch}?`)) return;
    startTransition(async () => {
      const res = await deleteEmployeeBranchEntry(r.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Dihapus");
      router.refresh();
    });
  };

  const handleAdd = () => {
    startTransition(async () => {
      const res = await createEmployeeBranchEntry({
        businessUnit: newBU,
        nameKeyword: newName,
        branch: newBranch,
        notes: newNotes || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Karyawan ditambah");
      setAdding(false);
      setNewName("");
      setNewBranch("");
      setNewNotes("");
      router.refresh();
    });
  };

  const buGroups = Array.from(new Set(rows.map((r) => r.businessUnit)));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          {rows.length} keyword mapped. Dipakai auto-fill cabang pada tx
          Salaries & Wages.
        </p>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4 mr-1" /> Tambah karyawan
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Business Unit</label>
              <select
                value={newBU}
                onChange={(e) => {
                  setNewBU(e.target.value);
                  setNewBranch("");
                }}
                className="w-full mt-1 text-sm px-2 py-1.5 rounded border border-border bg-background"
              >
                {businessUnits.map((bu) => (
                  <option key={bu} value={bu}>{bu}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nama keyword</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="mis. Hasna"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cabang</label>
              <select
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                className="w-full mt-1 text-sm px-2 py-1.5 rounded border border-border bg-background"
              >
                <option value="">— pilih —</option>
                {presetsForBU(newBU).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes (opsional)</label>
              <Input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="catatan"
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={isPending}>
              {isPending ? "Menyimpan…" : "Tambah"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAdding(false)}
              disabled={isPending}
            >
              Batal
            </Button>
          </div>
        </div>
      )}

      {buGroups.map((bu) => {
        const groupRows = rows.filter((r) => r.businessUnit === bu);
        return (
          <div key={bu} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="bg-muted px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">
              {bu} <span className="font-normal text-muted-foreground/70">({groupRows.length})</span>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase">
                  <tr className="border-b border-border/60">
                    <th className="text-left font-semibold px-3 py-2">Nama keyword</th>
                    <th className="text-left font-semibold px-3 py-2 w-40">Cabang</th>
                    <th className="text-left font-semibold px-3 py-2">Notes</th>
                    <th className="text-right font-semibold px-3 py-2 w-32">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((r) => {
                    const editing = editingId === r.id;
                    return (
                      <tr key={r.id} className="border-t border-border/60">
                        <td className="px-3 py-2">
                          {editing ? (
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="text-sm"
                            />
                          ) : (
                            <span className="font-medium">{r.nameKeyword}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {editing ? (
                            <select
                              value={editBranch}
                              onChange={(e) => setEditBranch(e.target.value)}
                              className="w-full text-sm px-2 py-1 rounded border border-border bg-background"
                            >
                              {presetsForBU(r.businessUnit).map((b) => (
                                <option key={b} value={b}>{b}</option>
                              ))}
                            </select>
                          ) : (
                            <span>{r.branch}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {editing ? (
                            <Input
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              className="text-sm"
                            />
                          ) : (
                            r.notes ?? "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex gap-1 justify-end">
                            {editing ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleSaveEdit(r)}
                                  disabled={isPending}
                                  className="h-7 w-7 p-0"
                                >
                                  <Save className="size-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingId(null)}
                                  disabled={isPending}
                                  className="h-7 w-7 p-0"
                                >
                                  <X className="size-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleStartEdit(r)}
                                  className="h-7 w-7 p-0"
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(r)}
                                  disabled={isPending}
                                  className="h-7 w-7 p-0 text-destructive"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
