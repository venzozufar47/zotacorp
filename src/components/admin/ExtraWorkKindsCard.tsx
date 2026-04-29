"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ShoppingBag,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createExtraWorkKind,
  updateExtraWorkKind,
  setExtraWorkKindActive,
  deleteExtraWorkKind,
  setExtraWorkKindAssignees,
  type ExtraWorkKindRow,
} from "@/lib/actions/extra-work-kinds.actions";

interface EmployeeOption {
  id: string;
  name: string;
}

interface Props {
  initial: ExtraWorkKindRow[];
  employees: EmployeeOption[];
}

export function ExtraWorkKindsCard({ initial, employees }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");

  function onAdd() {
    const name = newName.trim();
    if (!name) {
      toast.error("Nama wajib diisi");
      return;
    }
    startTransition(async () => {
      // Formula tidak di-set di sini — admin pilih per-entry di payslip
      // (bisa beda per karyawan / per kejadian). Default kind = "custom"
      // sebagai fallback kalau admin lupa override.
      const res = await createExtraWorkKind({
        name,
        formulaKind: "custom",
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`"${name}" ditambahkan`);
      setNewName("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <ShoppingBag size={14} />
            Kerjaan tambahan
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            Daftar jenis kerjaan tambahan + assignee. Tiap kind di-assign
            ke karyawan tertentu (cuma yang assigned yang lihat di
            dropdown). Formula honor (fixed / custom / × gaji harian)
            di-set per entry di halaman <strong>payslip variables</strong>{" "}
            karena bisa beda per karyawan & per kejadian.
          </p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {initial.map((kind) => (
          <KindRow
            key={kind.id}
            kind={kind}
            employees={employees}
            onRefresh={() => router.refresh()}
          />
        ))}
        {initial.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground italic text-center">
            Belum ada jenis kerjaan tambahan.
          </p>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border bg-muted/20">
        {!open ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOpen(true)}
            className="gap-1.5"
          >
            <Plus size={14} />
            Tambah jenis baru
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nama (mis. delivery, lembur natal)"
              onKeyDown={(e) => {
                if (e.key === "Enter") onAdd();
              }}
              autoFocus
              className="h-9 text-sm flex-1"
            />
            <Button
              type="button"
              size="sm"
              onClick={onAdd}
              disabled={pending || !newName.trim()}
            >
              Tambah
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setNewName("");
              }}
            >
              Batal
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function KindRow({
  kind,
  employees,
  onRefresh,
}: {
  kind: ExtraWorkKindRow;
  employees: EmployeeOption[];
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draftName, setDraftName] = useState(kind.name);
  const [pending, startTransition] = useTransition();

  function commitEdit() {
    const name = draftName.trim();
    if (!name) {
      toast.error("Nama tidak boleh kosong");
      return;
    }
    startTransition(async () => {
      const res = await updateExtraWorkKind({ id: kind.id, name });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Tersimpan");
      setEditing(false);
      onRefresh();
    });
  }

  function toggleActive() {
    startTransition(async () => {
      const res = await setExtraWorkKindActive({
        id: kind.id,
        active: !kind.active,
      });
      if ("error" in res) toast.error(res.error);
      else onRefresh();
    });
  }

  function onDelete() {
    if (
      !confirm(
        `Hapus "${kind.name}"? Riwayat extra_work_logs tetap tersimpan tapi tidak bisa pakai jenis ini lagi.`
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteExtraWorkKind({ id: kind.id });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success("Dihapus");
        onRefresh();
      }
    });
  }

  return (
    <div>
      <div className="px-4 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground shrink-0"
          aria-label={expanded ? "Tutup" : "Buka"}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {editing ? (
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="h-8 text-sm flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                setDraftName(kind.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={
                  "text-sm font-medium " +
                  (kind.active
                    ? "text-foreground"
                    : "text-muted-foreground line-through")
                }
              >
                {kind.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {kind.assignedUserIds.length} assignee
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <>
              <Button
                type="button"
                size="icon-sm"
                onClick={commitEdit}
                disabled={pending} loading={pending}
              >
                <Check size={14} />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraftName(kind.name);
                }}
              >
                <X size={14} />
              </Button>
            </>
          ) : (
            <>
              <label
                className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1 cursor-pointer"
                title="Toggle aktif"
              >
                <input
                  type="checkbox"
                  checked={kind.active}
                  onChange={toggleActive}
                  disabled={pending}
                />
                aktif
              </label>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                disabled={pending} loading={pending}
              >
                <Pencil size={14} />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={onDelete}
                disabled={pending} loading={pending}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={14} />
              </Button>
            </>
          )}
        </div>
      </div>

      {expanded && !editing && (
        <AssigneeEditor
          kindId={kind.id}
          initial={kind.assignedUserIds}
          employees={employees}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}

function AssigneeEditor({
  kindId,
  initial,
  employees,
  onSaved,
}: {
  kindId: string;
  initial: string[];
  employees: EmployeeOption[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [pending, startTransition] = useTransition();

  const dirty =
    selected.size !== initial.length ||
    initial.some((id) => !selected.has(id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(employees.map((e) => e.id)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  function save() {
    startTransition(async () => {
      const res = await setExtraWorkKindAssignees({
        kindId,
        userIds: [...selected],
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Assignment tersimpan");
      onSaved();
    });
  }

  return (
    <div className="px-4 pb-3 pl-12 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Karyawan yang dapat akses
        </p>
        <div className="flex items-center gap-2 text-[10px]">
          <button
            type="button"
            onClick={selectAll}
            className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Pilih semua
          </button>
          <span className="text-muted-foreground/40">·</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Kosongkan
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
        {employees.map((e) => {
          const checked = selected.has(e.id);
          return (
            <label
              key={e.id}
              className={
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer border " +
                (checked
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted")
              }
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(e.id)}
                className="size-3.5"
              />
              <span className="truncate">{e.name}</span>
            </label>
          );
        })}
      </div>
      {dirty && (
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set(initial))}
            disabled={pending} loading={pending}
          >
            Batal
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={pending} loading={pending}>
            {pending ? "Menyimpan…" : "Simpan assignment"}
          </Button>
        </div>
      )}
    </div>
  );
}
