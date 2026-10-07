"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Camera, Loader2, Plus, X } from "lucide-react";
import { updateAssignedTask } from "@/lib/actions/assigned-tasks.actions";
import type { AdminTaskDetail } from "@/lib/tasks/types";
import { Field, inputCls, primaryBtn, smallBtn } from "@/components/admin/registry/RegistryUi";

interface DraftItem {
  /** id item di DB; undefined = item baru. */
  id?: string;
  title: string;
  note: string | null;
  /** Sudah punya foto bukti di ronde berjalan. */
  hasPhoto: boolean;
  /** Kunci stabil untuk React (id DB atau penanda lokal). */
  key: string;
}

/**
 * Form edit tugas. Judul/keterangan bisa diubah selama tugas belum selesai;
 * item hanya saat tugas `open` (saat `submitted` admin sedang memeriksa foto
 * per item, jadi daftar item dikunci).
 */
export function TaskEditForm({
  detail,
  onCancel,
  onSaved,
}: {
  detail: AdminTaskDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const itemsLocked = detail.status !== "open";
  const [title, setTitle] = useState(detail.title);
  const [description, setDescription] = useState(detail.description ?? "");
  const [applyToBatch, setApplyToBatch] = useState(false);
  const [items, setItems] = useState<DraftItem[]>(
    detail.items.map((i) => ({
      id: i.id,
      title: i.title,
      note: i.note,
      hasPhoto: i.done,
      key: i.id,
    }))
  );
  const [pending, startTransition] = useTransition();

  function move(idx: number, dir: -1 | 1) {
    setItems((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function remove(idx: number) {
    const it = items[idx];
    if (
      it.hasPhoto &&
      !window.confirm(`Item "${it.title}" sudah punya foto. Menghapusnya juga menghapus foto itu. Lanjut?`)
    ) {
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function save() {
    const cleaned = items
      .map((i) => ({ ...i, title: i.title.trim() }))
      .filter((i) => i.title.length > 0);
    startTransition(async () => {
      const res = await updateAssignedTask({
        taskId: detail.id,
        title,
        description: description || null,
        items: cleaned.map((i) => ({ id: i.id, title: i.title, note: i.note })),
        applyToBatch,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tugas diperbarui");
      onSaved();
    });
  }

  return (
    <div className="space-y-3">
      <Field label="Judul tugas">
        <input
          className={inputCls}
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
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

      <Field
        label="Checklist"
        hint={
          itemsLocked
            ? "Item dikunci selama tugas menunggu verifikasi. Setujui atau tolak dulu untuk mengubahnya."
            : "Item yang dihapus ikut menghapus foto buktinya. Karyawan dapat notifikasi bila daftar item berubah."
        }
      >
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={it.key} className="flex items-center gap-1.5">
              <input
                className={inputCls + " !mt-0"}
                value={it.title}
                maxLength={200}
                disabled={itemsLocked}
                onChange={(e) =>
                  setItems((prev) =>
                    prev.map((v, i) => (i === idx ? { ...v, title: e.target.value } : v))
                  )
                }
              />
              {it.hasPhoto && (
                <span title="Sudah ada foto" className="text-muted-foreground shrink-0">
                  <Camera size={14} />
                </span>
              )}
              {!itemsLocked && (
                <>
                  <button
                    type="button"
                    aria-label="Naikkan"
                    disabled={idx === 0}
                    onClick={() => move(idx, -1)}
                    className="size-8 shrink-0 inline-flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Turunkan"
                    disabled={idx === items.length - 1}
                    onClick={() => move(idx, 1)}
                    className="size-8 shrink-0 inline-flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  {items.length > 1 && (
                    <button
                      type="button"
                      aria-label="Hapus item"
                      onClick={() => remove(idx)}
                      className="size-8 shrink-0 inline-flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"
                    >
                      <X size={15} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          {!itemsLocked && items.length < 40 && (
            <button
              type="button"
              className={smallBtn}
              onClick={() =>
                setItems((prev) => [
                  ...prev,
                  { title: "", note: null, hasPhoto: false, key: `new-${crypto.randomUUID()}` },
                ])
              }
            >
              <Plus size={13} /> Tambah item
            </button>
          )}
        </div>
      </Field>

      {detail.batchOthers > 0 && (
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={applyToBatch}
            onChange={(e) => setApplyToBatch(e.target.checked)}
          />
          <span>
            Terapkan judul &amp; keterangan juga ke {detail.batchOthers} penerima lain dari
            penugasan ini yang belum selesai.
            <span className="block text-[11px] text-muted-foreground">
              Daftar item hanya berubah untuk {detail.assigneeName}.
            </span>
          </span>
        </label>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className={smallBtn} onClick={onCancel} disabled={pending}>
          Batal
        </button>
        <button type="button" className={primaryBtn} onClick={save} disabled={pending}>
          {pending && <Loader2 size={14} className="animate-spin" />}
          Simpan
        </button>
      </div>
    </div>
  );
}
