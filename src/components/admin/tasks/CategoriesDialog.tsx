"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createTaskCategory,
  deleteTaskCategory,
  renameTaskCategory,
} from "@/lib/actions/task-categories.actions";
import type { TaskCategory } from "@/lib/tasks/types";
import { Shell, inputCls } from "@/components/admin/registry/RegistryUi";

/**
 * Kelola kategori tugas (khusus superadmin). Kategori hanya alat
 * pengelompokan di sisi admin — karyawan tidak pernah melihatnya.
 */
export function CategoriesDialog({
  categories,
  onClose,
}: {
  categories: TaskCategory[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string, after?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Gagal");
        return;
      }
      if (okMsg) toast.success(okMsg);
      after?.();
      router.refresh();
    });
  }

  function add() {
    if (!name.trim()) return;
    run(() => createTaskCategory(name), "Kategori ditambahkan", () => setName(""));
  }

  function saveRename(id: string) {
    run(() => renameTaskCategory(id, editName), "Nama diperbarui", () => setEditingId(null));
  }

  function remove(c: TaskCategory) {
    const msg =
      c.taskCount > 0
        ? `Hapus kategori "${c.name}"? ${c.taskCount} tugas yang memakainya menjadi tanpa kategori.`
        : `Hapus kategori "${c.name}"?`;
    if (!window.confirm(msg)) return;
    run(() => deleteTaskCategory(c.id), "Kategori dihapus");
  }

  return (
    <Shell title="Kategori tugas" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Pengelompokan untuk memudahkan Anda mengatur tugas. Karyawan tidak melihat kategori.
        </p>

        <ul className="rounded-xl border border-border divide-y divide-border">
          {categories.length === 0 && (
            <li className="p-3 text-xs text-muted-foreground">Belum ada kategori.</li>
          )}
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 min-h-12">
              {editingId === c.id ? (
                <>
                  <input
                    className={inputCls + " !mt-0 h-10 flex-1"}
                    value={editName}
                    maxLength={40}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(c.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Simpan nama"
                    disabled={pending || !editName.trim()}
                    onClick={() => saveRename(c.id)}
                    className="size-10 shrink-0 grid place-items-center rounded-xl hover:bg-muted disabled:opacity-50"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Batal"
                    onClick={() => setEditingId(null)}
                    className="size-10 shrink-0 grid place-items-center rounded-xl hover:bg-muted text-muted-foreground"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0 truncate text-sm font-medium">{c.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {c.taskCount} tugas
                  </span>
                  <button
                    type="button"
                    aria-label={`Ubah nama ${c.name}`}
                    disabled={pending}
                    onClick={() => {
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                    className="size-10 shrink-0 grid place-items-center rounded-xl hover:bg-muted text-muted-foreground"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Hapus ${c.name}`}
                    disabled={pending}
                    onClick={() => remove(c)}
                    className="size-10 shrink-0 grid place-items-center rounded-xl hover:bg-muted text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            className={inputCls + " !mt-0 h-11 flex-1"}
            value={name}
            maxLength={40}
            placeholder="Nama kategori baru"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button
            type="button"
            onClick={add}
            disabled={pending || !name.trim()}
            className="shrink-0 h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Tambah
          </button>
        </div>
      </div>
    </Shell>
  );
}
