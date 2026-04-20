"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  listAssigneeCandidates,
  setBankAccountAssignees,
  type AssigneeCandidate,
} from "@/lib/actions/cashflow.actions";

interface Props {
  bankAccountId: string;
  accountName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Admin-only dialog to set which staff can access a cash rekening.
 * Loads every profile in the system, checkbox-toggled by current
 * assignment state. Save replaces the set atomically — added users
 * gain access, removed users lose it.
 */
export function AssignUsersDialog({
  bankAccountId,
  accountName,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<AssigneeCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listAssigneeCandidates(bankAccountId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        const list = res.data ?? [];
        setCandidates(list);
        setSelected(
          new Set(list.filter((c) => c.assigned).map((c) => c.id))
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, bankAccountId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await setBankAccountAssignees(bankAccountId, [...selected]);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { added, removed } = res.data!;
      toast.success(
        `Akses diperbarui — ${added} ditambah, ${removed} dicabut.`
      );
      router.refresh();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  // Filter + sort: admins last (they already have access), then
  // currently-selected first for discoverability.
  const visible = candidates
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (c.fullName ?? "").toLowerCase().includes(q) ||
        (c.nickname ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const aSel = selected.has(a.id) ? 0 : 1;
      const bSel = selected.has(b.id) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      const aAdm = a.role === "admin" ? 1 : 0;
      const bAdm = b.role === "admin" ? 1 : 0;
      if (aAdm !== bAdm) return aAdm - bAdm;
      return (a.fullName ?? "").localeCompare(b.fullName ?? "");
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={18} />
            Assign akses ke karyawan
          </DialogTitle>
          <DialogDescription>
            Rekening <strong>{accountName}</strong> · karyawan terpilih bisa
            lihat, input, dan edit transaksi di rekening ini. Hanya rekening
            ini — tidak ada akses ke rekening lain.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Cari karyawan (nama / email)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3"
        />

        {loading ? (
          <div className="py-10 text-center">
            <Loader2 size={18} className="mx-auto animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-6 text-center">
            Tidak ada karyawan yang cocok.
          </p>
        ) : (
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {visible.map((c) => {
              const sel = selected.has(c.id);
              const isAdmin = c.role === "admin";
              return (
                <label
                  key={c.id}
                  className={
                    "flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition " +
                    (sel
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40") +
                    (isAdmin ? " opacity-60" : "")
                  }
                >
                  <input
                    type="checkbox"
                    checked={sel || isAdmin}
                    disabled={isAdmin}
                    onChange={() => !isAdmin && toggle(c.id)}
                    className="rounded border-border"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {c.nickname || c.fullName || c.email || "(tanpa nama)"}
                    </p>
                    {c.email && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        {c.email}
                      </p>
                    )}
                  </div>
                  {isAdmin && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground rounded-full bg-muted px-1.5 py-0.5">
                      admin
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Batal
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
