"use client";

/**
 * UI shared antara halaman admin (lihat & assign semua) dan halaman
 * employee (resolve sendiri). Prop `mode` mengatur kemampuan:
 *   - "admin": tampilkan kolom assignee + tombol Assign + Resolve
 *   - "self":  tampilkan tx sendiri saja, hanya tombol Resolve
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { formatDateID } from "@/lib/utils/date-formats";
import { Button } from "@/components/ui/button";
import {
  resolveAssignment,
  type AssignmentRow,
} from "@/lib/actions/cashflow-assignments.actions";
import { AssignDialog } from "./AssignDialog";
import { getCategoryPresets } from "@/lib/cashflow/categories";
import { formatIDR } from "@/lib/cashflow/format";

interface Props {
  rows: AssignmentRow[];
  mode: "admin" | "self";
}

export function AssignmentsClient({ rows, mode }: Props) {
  const router = useRouter();
  // bulkAssigning: array of all row IDs to assign in one shot. null = closed.
  const [bulkAssigning, setBulkAssigning] = useState<string[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<string>("");
  const [editBranch, setEditBranch] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {mode === "admin"
            ? "Tidak ada transaksi yang butuh assignment saat ini."
            : "Tidak ada transaksi yang di-assign ke kamu saat ini."}
        </p>
      </div>
    );
  }

  const handleStartResolve = (row: AssignmentRow) => {
    setEditingId(row.id);
    setEditCategory(
      row.category && row.category !== "Needs Assignment" ? row.category : ""
    );
    setEditBranch(
      row.branch && row.branch !== "Needs Assignment" ? row.branch : ""
    );
  };

  const handleSaveResolve = (row: AssignmentRow) => {
    if (!editCategory || !editBranch) {
      toast.error("Pilih kategori & cabang dulu");
      return;
    }
    startTransition(async () => {
      const res = await resolveAssignment(row.id, {
        category: editCategory,
        branch: editBranch,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Berhasil resolve");
      setEditingId(null);
      router.refresh();
    });
  };

  // Hitung berapa rows yang unassigned (admin biasa mau assign yang
  // belum di-handle saja). Tombol bulk juga affordance "Assign semua".
  const unassignedRows = rows.filter((r) => !r.assignedToUserId);

  return (
    <div className="space-y-4">
      {mode === "admin" && rows.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {unassignedRows.length > 0 ? (
              <>
                <strong className="text-foreground">
                  {unassignedRows.length}
                </strong>{" "}
                dari {rows.length} transaksi belum di-assign ke siapapun.
              </>
            ) : (
              <>Semua {rows.length} transaksi sudah di-assign.</>
            )}
          </div>
          <div className="flex gap-2">
            {unassignedRows.length > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setBulkAssigning(unassignedRows.map((r) => r.id))
                }
              >
                <UserPlus className="size-4 mr-1.5" />
                Assign {unassignedRows.length} belum di-assign
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setBulkAssigning(rows.map((r) => r.id))}
            >
              Assign / re-assign semua {rows.length}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead className="bg-muted text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left font-semibold px-3 py-2">Tanggal</th>
                <th className="text-left font-semibold px-3 py-2">Rekening</th>
                <th className="text-left font-semibold px-3 py-2">Transaksi</th>
                <th className="text-right font-semibold px-3 py-2 w-32">Nominal</th>
                {mode === "admin" && (
                  <th className="text-left font-semibold px-3 py-2 w-40">
                    Assignee
                  </th>
                )}
                <th className="text-left font-semibold px-3 py-2 w-64">
                  Resolve
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const presets = getCategoryPresets(r.businessUnit);
                const list =
                  r.debit > 0 ? presets.debit : presets.credit;
                const branches = presets.branches.filter(
                  (b) => b !== "Needs Assignment"
                );
                const editing = editingId === r.id;
                return (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="px-3 py-2 align-top font-mono tabular-nums whitespace-nowrap">
                      {formatDateID(r.date)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium">{r.bankAccountName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.businessUnit}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top max-w-xs">
                      <div className="line-clamp-2">{r.description}</div>
                      {r.notes && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 italic">
                          {r.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right font-mono tabular-nums">
                      <span className={r.debit > 0 ? "text-destructive" : "text-emerald-600"}>
                        {r.debit > 0
                          ? `- ${formatIDR(r.debit)}`
                          : `+ ${formatIDR(r.credit)}`}
                      </span>
                    </td>
                    {mode === "admin" && (
                      <td className="px-3 py-2 align-top">
                        {r.assigneeName ? (
                          <div className="text-xs text-foreground font-medium leading-snug">
                            {r.assigneeName}
                          </div>
                        ) : (
                          <div className="text-[11px] italic text-muted-foreground leading-snug">
                            belum di-assign
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 align-top">
                      {editing ? (
                        <div className="space-y-1.5">
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="w-full text-xs px-2 py-1 rounded border border-border bg-background"
                          >
                            <option value="">— pilih kategori —</option>
                            {list
                              .filter((c) => c !== "Needs Assignment")
                              .map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                          </select>
                          <select
                            value={editBranch}
                            onChange={(e) => setEditBranch(e.target.value)}
                            className="w-full text-xs px-2 py-1 rounded border border-border bg-background"
                          >
                            <option value="">— pilih cabang —</option>
                            {branches.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              onClick={() => handleSaveResolve(r)}
                              disabled={isPending}
                              className="h-7 px-2 text-xs"
                            >
                              Simpan
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                              disabled={isPending}
                              className="h-7 px-2 text-xs"
                            >
                              Batal
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStartResolve(r)}
                          className="h-7 px-3 text-xs"
                        >
                          Resolve
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {bulkAssigning && (
        <AssignDialog
          rowIds={bulkAssigning}
          contextLabel={
            bulkAssigning.length === rows.length
              ? `Assign semua ${rows.length} transaksi pending`
              : `Assign ${bulkAssigning.length} transaksi yang belum di-assign`
          }
          onClose={() => setBulkAssigning(null)}
        />
      )}
    </div>
  );
}
