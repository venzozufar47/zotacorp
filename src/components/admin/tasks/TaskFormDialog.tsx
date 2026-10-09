"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { createAssignedTask } from "@/lib/actions/assigned-tasks.actions";
import { Field, Shell, inputCls } from "@/components/admin/registry/RegistryUi";
import { TASK_REFERENCE_MAX, type TaskCategory } from "@/lib/tasks/types";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { AttachmentPicker, discardPickedPhotos, type PickedPhoto } from "./AttachmentPicker";
import type { AssignableEmployee } from "./TasksManager";

const MAX_ITEMS = 40;

/**
 * Form tugas baru, tiga langkah dalam satu layar: judul → checklist →
 * penerima. Penerima boleh dikosongkan: tugas disimpan sebagai "belum
 * ditugaskan" dan ditugaskan nanti lewat matriks. Tombol aksi menempel di
 * bawah supaya selalu terjangkau di HP. Di item checklist, Enter menambah
 * baris baru dan langsung fokus ke sana.
 */
export function TaskFormDialog({
  employees,
  categories,
  onClose,
}: {
  employees: AssignableEmployee[];
  categories: TaskCategory[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<{ key: string; value: string }[]>([
    { key: "item-0", value: "" },
  ]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const today = jakartaDateString(new Date());
  const [startDate, setStartDate] = useState(today);
  const sentRef = useRef(false);
  const [query, setQuery] = useState("");
  const itemRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const nextKey = useRef(1);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? employees.filter((e) => e.name.toLowerCase().includes(q)) : employees;
  }, [employees, query]);

  const filledItems = items.filter((i) => i.value.trim().length > 0).length;
  const isBacklog = picked.size === 0;
  const canSubmit =
    (isBacklog || startDate >= today) && title.trim().length > 0 && filledItems > 0;

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addItem(focus = true) {
    if (items.length >= MAX_ITEMS) return;
    const key = `item-${nextKey.current++}`;
    setItems((prev) => [...prev, { key, value: "" }]);
    if (focus) {
      // Tunggu baris baru ter-render, lalu fokuskan.
      requestAnimationFrame(() => itemRefs.current.get(key)?.focus());
    }
  }

  function submit() {
    startTransition(async () => {
      const res = await createAssignedTask({
        title,
        description: description || null,
        items: items.map((i) => i.value.trim()).filter(Boolean).map((t) => ({ title: t })),
        assigneeIds: [...picked],
        categoryId: categoryId || null,
        attachmentPaths: photos.map((p) => p.path),
        startDate: isBacklog ? undefined : startDate || today,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.data?.backlog
          ? "Tugas disimpan — belum ditugaskan"
          : res.data && res.data.created > 1
            ? `Tugas dikirim ke ${res.data.created} karyawan`
            : "Tugas dikirim ke karyawan"
      );
      sentRef.current = true;
      router.refresh();
      onClose();
    });
  }

  /** Tutup tanpa kirim → buang foto yang sudah terunggah. */
  function cancel() {
    if (!sentRef.current) void discardPickedPhotos(photos);
    onClose();
  }

  const allShownPicked = shown.length > 0 && shown.every((e) => picked.has(e.id));

  return (
    <Shell title="Tugas baru" onClose={cancel} wide>
      <div className="space-y-4">
        <Field label="1. Judul tugas">
          <input
            className={inputCls + " h-11"}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="mis. Pasang dekorasi studio besar"
            autoFocus
          />
        </Field>

        {categories.length > 0 && (
          <Field label="Kategori (opsional)" hint="Hanya terlihat oleh admin.">
            <select
              className={inputCls + " h-11"}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Tanpa kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {!isBacklog && (
          <Field
            label="Tanggal mulai"
            hint={
              startDate > today
                ? "Tugas baru muncul di karyawan dan notifikasi dikirim pada tanggal ini."
                : "Hari ini — tugas langsung muncul di karyawan dan notifikasi dikirim sekarang."
            }
          >
            <input
              type="date"
              className={inputCls + " h-11"}
              value={startDate}
              min={today}
              onChange={(e) => setStartDate(e.target.value || today)}
            />
          </Field>
        )}

        <Field label="Keterangan (opsional)">
          <textarea
            className={inputCls}
            rows={2}
            value={description}
            maxLength={1000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detail tambahan untuk karyawan"
          />
        </Field>

        <Field label="2. Checklist" hint="Tiap item wajib dikerjakan dengan satu foto bukti.">
          <ol className="space-y-2">
            {items.map((it, idx) => (
              <li key={it.key} className="flex items-center gap-2">
                <span className="grid place-items-center size-7 shrink-0 rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {idx + 1}
                </span>
                <input
                  ref={(el) => {
                    if (el) itemRefs.current.set(it.key, el);
                    else itemRefs.current.delete(it.key);
                  }}
                  className={inputCls + " !mt-0 h-11"}
                  value={it.value}
                  maxLength={200}
                  enterKeyHint="next"
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((v) => (v.key === it.key ? { ...v, value: e.target.value } : v))
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (it.value.trim()) addItem();
                    }
                  }}
                  placeholder={idx === 0 ? "mis. Foto dekorasi dari depan" : `Item ${idx + 1}`}
                />
                {items.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Hapus item ${idx + 1}`}
                    className="size-11 shrink-0 inline-flex items-center justify-center rounded-xl hover:bg-muted text-muted-foreground"
                    onClick={() => setItems((prev) => prev.filter((v) => v.key !== it.key))}
                  >
                    <X size={16} />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {items.length < MAX_ITEMS && (
            <button
              type="button"
              onClick={() => addItem()}
              className="mt-2 h-11 px-3 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 inline-flex items-center gap-1.5"
            >
              <Plus size={15} /> Tambah item
            </button>
          )}
        </Field>

        <Field
          label="Foto referensi (opsional)"
          hint={`Contoh hasil atau instruksi bergambar — tampil di tugas karyawan. Maksimal ${TASK_REFERENCE_MAX} foto, dikompres otomatis.`}
        >
          <AttachmentPicker photos={photos} onChange={setPhotos} max={TASK_REFERENCE_MAX} />
        </Field>

        <Field
          label={`3. Penerima (opsional)${picked.size > 0 ? ` · ${picked.size} dipilih` : ""}`}
          hint="Kosongkan untuk menyimpan tanpa penerima — tugas masuk “Belum ditugaskan” dan bisa diseret ke karyawan di matriks. Bila diisi, tiap karyawan mendapat salinan sendiri (progres & verifikasi terpisah)."
        >
          <div className="flex gap-2">
            <input
              type="search"
              className={inputCls + " !mt-0 h-11"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama…"
            />
            {shown.length > 0 && (
              <button
                type="button"
                className="shrink-0 h-11 px-3 rounded-xl border border-border text-xs font-semibold hover:bg-muted"
                onClick={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    for (const e of shown) {
                      if (allShownPicked) next.delete(e.id);
                      else next.add(e.id);
                    }
                    return next;
                  })
                }
              >
                {allShownPicked ? "Kosongkan" : "Pilih semua"}
              </button>
            )}
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border">
            {shown.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">Tidak ada karyawan.</p>
            )}
            {shown.map((e) => (
              <label
                key={e.id}
                className="flex items-center gap-3 px-3 min-h-12 text-sm cursor-pointer hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  className="size-5 shrink-0"
                  checked={picked.has(e.id)}
                  onChange={() => togglePick(e.id)}
                />
                <span className="flex-1 min-w-0 truncate">{e.name}</span>
                {e.businessUnit && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {e.businessUnit}
                  </span>
                )}
              </label>
            ))}
          </div>
        </Field>
      </div>

      {/* Aksi menempel di bawah — tetap terjangkau saat form di-scroll */}
      <div className="sticky -bottom-4 -mx-4 -mb-4 mt-4 px-4 py-3 bg-card border-t border-border flex gap-2 sm:justify-end">
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="h-11 px-4 rounded-xl border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !canSubmit}
          className="flex-1 sm:flex-none h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          {isBacklog
            ? "Simpan tanpa penerima"
            : picked.size > 1
              ? `Kirim ke ${picked.size} karyawan`
              : "Kirim tugas"}
        </button>
      </div>
    </Shell>
  );
}
