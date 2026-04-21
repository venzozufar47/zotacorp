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
  type AssigneeScope,
  type AssigneeSelection,
} from "@/lib/actions/cashflow.actions";

interface Props {
  bankAccountId: string;
  accountName: string;
  /** Rekening ini POS-enabled? Mengontrol apakah opsi "POS saja" tersedia. */
  posEnabled: boolean;
  /** Jenis bank ("cash" / "mandiri" / dst). Scope "full" hanya boleh untuk cash. */
  bank: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Admin dialog untuk kelola assignment per-rekening dengan scope:
 * - "Full" — bisa input/edit cashflow + akses POS (rekening cash only)
 * - "POS saja" — cuma bisa input sale di /pos, tidak lihat cashflow
 *   (hanya muncul untuk rekening POS-enabled)
 * Toggle scope per user. Save replace set secara atomis.
 */
export function AssignUsersDialog({
  bankAccountId,
  accountName,
  posEnabled,
  bank,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<AssigneeCandidate[]>([]);
  // userId → scope. Absen berarti tidak di-assign.
  const [selected, setSelected] = useState<Map<string, AssigneeScope>>(
    new Map()
  );
  const [search, setSearch] = useState("");

  const canFull = bank === "cash";
  const canPosOnly = posEnabled;

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
        const next = new Map<string, AssigneeScope>();
        for (const c of list) {
          if (c.assigned && c.scope) next.set(c.id, c.scope);
        }
        setSelected(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, bankAccountId]);

  function setScope(id: string, scope: AssigneeScope | null) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (scope === null) next.delete(id);
      else next.set(id, scope);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const selections: AssigneeSelection[] = [...selected.entries()].map(
        ([userId, scope]) => ({ userId, scope })
      );
      const res = await setBankAccountAssignees(bankAccountId, selections);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { added, removed, updated } = res.data!;
      toast.success(
        `Akses diperbarui — ${added} ditambah, ${updated} diubah, ${removed} dicabut.`
      );
      router.refresh();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

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
            Rekening <strong>{accountName}</strong>. Pilih scope per karyawan —
            <strong> Full</strong> bisa input/edit cashflow,{" "}
            <strong>POS saja</strong> cuma bisa input sale di /pos tanpa akses
            cashflow.
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
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {visible.map((c) => {
              const scope = selected.get(c.id) ?? null;
              const isAdmin = c.role === "admin";
              return (
                <div
                  key={c.id}
                  className={
                    "rounded-lg border p-2.5 transition " +
                    (scope
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40") +
                    (isAdmin ? " opacity-60" : "")
                  }
                >
                  <div className="flex items-center gap-3">
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
                  </div>
                  {!isAdmin && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <ScopeChip
                        label="Tidak ada"
                        active={scope === null}
                        onClick={() => setScope(c.id, null)}
                      />
                      {canFull && (
                        <ScopeChip
                          label="Full"
                          active={scope === "full"}
                          onClick={() => setScope(c.id, "full")}
                        />
                      )}
                      {canPosOnly && (
                        <ScopeChip
                          label="POS saja"
                          active={scope === "pos_only"}
                          onClick={() => setScope(c.id, "pos_only")}
                        />
                      )}
                    </div>
                  )}
                </div>
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

function ScopeChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-xs font-semibold px-2.5 h-7 rounded-full border transition " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/60")
      }
    >
      {label}
    </button>
  );
}
