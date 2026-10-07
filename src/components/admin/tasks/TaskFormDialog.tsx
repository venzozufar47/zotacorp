"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { createAssignedTask } from "@/lib/actions/assigned-tasks.actions";
import {
  Field,
  Shell,
  inputCls,
  primaryBtn,
  smallBtn,
} from "@/components/admin/registry/RegistryUi";
import type { AssignableEmployee } from "./TasksManager";

/** Form tugas baru: judul, daftar item checklist, dan satu/lebih karyawan penerima. */
export function TaskFormDialog({
  employees,
  onClose,
}: {
  employees: AssignableEmployee[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<string[]>([""]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? employees.filter((e) => e.name.toLowerCase().includes(q)) : employees;
  }, [employees, query]);

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    const cleanItems = items.map((i) => i.trim()).filter(Boolean);
    startTransition(async () => {
      const res = await createAssignedTask({
        title,
        description: description || null,
        items: cleanItems.map((t) => ({ title: t })),
        assigneeIds: [...picked],
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.data && res.data.created > 1
          ? `${res.data.created} tugas dikirim ke karyawan`
          : "Tugas dikirim ke karyawan"
      );
      router.refresh();
      onClose();
    });
  }

  return (
    <Shell title="Tugas baru" onClose={onClose} wide>
      <Field label="Judul tugas">
        <input
          className={inputCls}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="mis. Pasang dekorasi studio besar"
        />
      </Field>

      <Field label="Keterangan (opsional)">
        <textarea
          className={inputCls}
          rows={2}
          value={description}
          maxLength={1000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <Field label="Checklist" hint="Tiap item wajib dikerjakan dengan satu foto bukti.">
        <div className="space-y-2">
          {items.map((value, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                className={inputCls + " !mt-0"}
                value={value}
                maxLength={200}
                onChange={(e) =>
                  setItems((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                }
                placeholder={`Item ${idx + 1}`}
              />
              {items.length > 1 && (
                <button
                  type="button"
                  aria-label="Hapus item"
                  className="size-9 shrink-0 inline-flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
          {items.length < 40 && (
            <button type="button" className={smallBtn} onClick={() => setItems((p) => [...p, ""])}>
              <Plus size={13} /> Tambah item
            </button>
          )}
        </div>
      </Field>

      <Field
        label={`Karyawan penerima (${picked.size} dipilih)`}
        hint="Tiap karyawan mendapat salinan sendiri — progres dan verifikasinya terpisah."
      >
        <input
          className={inputCls}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama…"
        />
        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {shown.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">Tidak ada karyawan.</p>
          )}
          {shown.map((e) => (
            <label
              key={e.id}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={picked.has(e.id)}
                onChange={() => togglePick(e.id)}
              />
              <span className="flex-1 truncate">{e.name}</span>
              {e.businessUnit && (
                <span className="text-[11px] text-muted-foreground">{e.businessUnit}</span>
              )}
            </label>
          ))}
        </div>
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className={smallBtn} onClick={onClose} disabled={pending}>
          Batal
        </button>
        <button type="button" className={primaryBtn} onClick={submit} disabled={pending}>
          {pending && <Loader2 size={14} className="animate-spin" />}
          Kirim tugas
        </button>
      </div>
    </Shell>
  );
}
