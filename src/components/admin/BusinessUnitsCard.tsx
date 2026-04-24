"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createBusinessUnit,
  renameBusinessUnit,
  deleteBusinessUnit,
  addRoleToBusinessUnit,
  removeRoleFromBusinessUnit,
  type BusinessUnitWithRoles,
} from "@/lib/actions/business-units.actions";

interface Props {
  initial: BusinessUnitWithRoles[];
}

/**
 * Admin UI untuk CRUD business unit + role-nya. Sumber data tunggal
 * sekarang tabel `business_units` + `business_unit_roles` (bukan
 * constants hard-coded lagi) — perubahan di sini langsung terpakai
 * di ProfileForm + filter finance.
 */
export function BusinessUnitsCard({ initial }: Props) {
  const router = useRouter();
  const [newBuName, setNewBuName] = useState("");
  const [pending, startTransition] = useTransition();

  function onAddBu() {
    const name = newBuName.trim();
    if (!name) {
      toast.error("Nama business unit wajib diisi");
      return;
    }
    startTransition(async () => {
      const res = await createBusinessUnit({ name });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Business unit "${name}" ditambahkan`);
      setNewBuName("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Building2 size={14} />
            Business units & role
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Atur daftar business unit + role di dalamnya. Dipakai di
            form profile karyawan dan filter keuangan. Rename BU
            otomatis meng-update referensi di profile & rekening. Delete
            diblok kalau masih ada profile/rekening memakai BU tsb.
          </p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {initial.map((bu) => (
          <BusinessUnitRow
            key={bu.id}
            bu={bu}
            onRefresh={() => router.refresh()}
          />
        ))}
        {initial.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground italic text-center">
            Belum ada business unit.
          </p>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center gap-2">
        <Input
          value={newBuName}
          onChange={(e) => setNewBuName(e.target.value)}
          placeholder="Nama business unit baru"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddBu();
            }
          }}
        />
        <Button type="button" onClick={onAddBu} disabled={pending} className="gap-1.5">
          <Plus size={14} />
          Tambah BU
        </Button>
      </div>
    </section>
  );
}

function BusinessUnitRow({
  bu,
  onRefresh,
}: {
  bu: BusinessUnitWithRoles;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(bu.name);
  const [newRole, setNewRole] = useState("");
  const [pending, startTransition] = useTransition();

  function saveRename() {
    const next = draftName.trim();
    if (!next || next === bu.name) {
      setEditing(false);
      setDraftName(bu.name);
      return;
    }
    startTransition(async () => {
      const res = await renameBusinessUnit({ id: bu.id, newName: next });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`BU diubah: ${bu.name} → ${next}`);
      setEditing(false);
      onRefresh();
    });
  }

  function onDelete() {
    if (
      !confirm(
        `Hapus business unit "${bu.name}" beserta semua role-nya?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteBusinessUnit({ id: bu.id });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`"${bu.name}" dihapus`);
      onRefresh();
    });
  }

  function onAddRole() {
    const role = newRole.trim();
    if (!role) {
      toast.error("Nama role wajib diisi");
      return;
    }
    startTransition(async () => {
      const res = await addRoleToBusinessUnit({
        businessUnitId: bu.id,
        roleName: role,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Role "${role}" ditambah ke ${bu.name}`);
      setNewRole("");
      onRefresh();
    });
  }

  function onRemoveRole(role: string) {
    if (!confirm(`Hapus role "${role}" dari ${bu.name}?`)) return;
    startTransition(async () => {
      const res = await removeRoleFromBusinessUnit({
        businessUnitId: bu.id,
        roleName: role,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Role "${role}" dihapus`);
      onRefresh();
    });
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="flex-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") {
                  setEditing(false);
                  setDraftName(bu.name);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={saveRename}
              disabled={pending}
              className="gap-1"
            >
              <Check size={14} />
              Simpan
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraftName(bu.name);
              }}
              disabled={pending}
            >
              <X size={14} />
            </Button>
          </>
        ) : (
          <>
            <h3 className="flex-1 font-semibold text-foreground">{bu.name}</h3>
            <span className="text-[10px] text-muted-foreground">
              {bu.roles.length} role
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={pending}
              className="gap-1"
            >
              <Pencil size={12} />
              Rename
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDelete}
              disabled={pending}
              className="gap-1 text-destructive hover:text-destructive"
            >
              <Trash2 size={12} />
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {bu.roles.map((r) => (
          <span
            key={r}
            className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1 text-xs text-foreground"
          >
            {r}
            <button
              type="button"
              onClick={() => onRemoveRole(r)}
              disabled={pending}
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Hapus role ${r}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {bu.roles.length === 0 && (
          <span className="text-[11px] text-muted-foreground italic">
            Belum ada role.
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          placeholder="Nama role baru"
          className="flex-1 h-8 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddRole();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onAddRole}
          disabled={pending}
          className="gap-1"
        >
          <Plus size={12} />
          Role
        </Button>
      </div>
    </div>
  );
}
