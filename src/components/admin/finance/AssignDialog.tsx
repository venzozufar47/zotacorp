"use client";

/**
 * Modal kecil buat admin pilih assignee untuk satu transaksi.
 * Dipanggil dari CashflowTable (tombol Assign) atau dari halaman
 * /admin/finance/assignments (bulk). Mengisi atau melepas
 * `assigned_to_user_id` pada baris tx.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  assignTransaction,
  assignManyTransactions,
  listAssignableProfiles,
  type AssignableProfile,
} from "@/lib/actions/cashflow-assignments.actions";

interface Props {
  /** Single tx assign: kasih satu ID. Bulk assign: kasih array IDs. */
  rowIds: string[];
  /** Hanya bermakna saat mode single (rowIds.length === 1) — biar
   *  modal pre-select assignee existing. Untuk bulk biarkan undefined. */
  currentAssigneeId?: string | null;
  /** Optional context text (mis. amount + description) buat header dialog. */
  contextLabel?: string;
  onClose: () => void;
}

export function AssignDialog({
  rowIds,
  currentAssigneeId,
  contextLabel,
  onClose,
}: Props) {
  const isBulk = rowIds.length > 1;
  const router = useRouter();
  const [profiles, setProfiles] = useState<AssignableProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    currentAssigneeId ?? null
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listAssignableProfiles().then((res) => {
      if (res.ok && res.data) setProfiles(res.data);
      else toast.error(res.ok ? "Gagal memuat daftar user" : res.error);
      setLoading(false);
    });
  }, []);

  const filtered = profiles.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      p.fullName.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      (p.businessUnit ?? "").toLowerCase().includes(q)
    );
  });

  const handleSave = () => {
    startTransition(async () => {
      const res = isBulk
        ? await assignManyTransactions(rowIds, selectedId)
        : await assignTransaction(rowIds[0], selectedId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const count = isBulk && "data" in res ? res.data?.applied ?? rowIds.length : 1;
      toast.success(
        selectedId
          ? isBulk
            ? `${count} transaksi berhasil di-assign`
            : "Berhasil di-assign"
          : isBulk
            ? `${count} assignment dibatalkan`
            : "Assignment dibatalkan"
      );
      router.refresh();
      onClose();
    });
  };

  const handleUnassign = () => {
    startTransition(async () => {
      const res = isBulk
        ? await assignManyTransactions(rowIds, null)
        : await assignTransaction(rowIds[0], null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Assignment dibatalkan");
      router.refresh();
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isBulk
              ? `Assign ${rowIds.length} transaksi ke user`
              : "Assign transaksi ke user"}
          </DialogTitle>
        </DialogHeader>
        {contextLabel && (
          <p className="text-xs text-muted-foreground -mt-2 mb-2 line-clamp-2">
            {contextLabel}
          </p>
        )}
        {isBulk && (
          <p className="text-xs bg-muted/50 border border-border rounded-md px-3 py-2 mb-2 leading-snug">
            Semua {rowIds.length} transaksi akan di-assign ke user yang dipilih.
            Existing assignment di-override.
          </p>
        )}
        <Input
          placeholder="Cari nama / email / BU"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          className="mb-3"
        />
        <div className="max-h-72 overflow-auto rounded-md border border-border divide-y divide-border/50">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Memuat…</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              Tidak ada user yang cocok.
            </div>
          ) : (
            filtered.map((p) => {
              const isSel = selectedId === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setSelectedId(isSel ? null : p.id)}
                  className={
                    "w-full text-left px-3 py-2 text-sm transition-colors " +
                    (isSel ? "bg-accent text-accent-foreground" : "hover:bg-muted")
                  }
                >
                  <div className="font-medium">{p.fullName}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.email}
                    {p.businessUnit ? ` · ${p.businessUnit}` : ""}
                    {p.role !== "employee" ? ` · ${p.role}` : ""}
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="flex justify-between gap-2 mt-4">
          {currentAssigneeId && (
            <Button
              variant="ghost"
              onClick={handleUnassign}
              disabled={isPending}
              className="text-destructive"
            >
              Lepas assignment
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={onClose} disabled={isPending}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
