"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Camera,
  CameraOff,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Power,
  Pencil,
  Check,
  X,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/utils/compress-image";

const REF_BUCKET = "cleaning-refs";

/** Public URL for a reference photo path (bucket is public — sync, no fetch). */
function refPublicUrl(path: string): string {
  return createSupabaseClient().storage.from(REF_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Upload an admin reference image (compressed); returns the storage path or null. */
async function uploadReferencePhoto(
  checklistId: string,
  file: File
): Promise<string | null> {
  const { blob, contentType, ext } = await compressImage(file);
  const supabase = createSupabaseClient();
  const path = `${checklistId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(REF_BUCKET)
    .upload(path, blob, { upsert: false, contentType });
  if (error) {
    toast.error("Gagal mengunggah foto contoh.");
    return null;
  }
  return path;
}
import {
  createChecklist,
  updateChecklist,
  deleteChecklist,
  setChecklistActive,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  reorderItems,
  addItemPhoto,
  updateItemPhoto,
  deleteItemPhoto,
  type CleaningChecklist,
  type CleaningItem,
  type ItemPhoto,
} from "@/lib/actions/cleaning.actions";

export function ChecklistManager({ initial }: { initial: CleaningChecklist[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  function run(fn: () => Promise<{ ok: true } | { error: string } | { ok: true; id: string }>, ok?: string) {
    startTransition(async () => {
      const res = await fn();
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (ok) toast.success(ok);
      router.refresh();
    });
  }

  function onCreate() {
    const n = name.trim();
    if (!n) {
      toast.error("Nama checklist wajib diisi");
      return;
    }
    startTransition(async () => {
      const res = await createChecklist({ name: n, description: desc.trim() });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Checklist "${n}" dibuat`);
      setName("");
      setDesc("");
      setOpen((o) => ({ ...o, [res.id]: true }));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* New checklist */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h2 className="font-display text-base font-semibold">Buat checklist baru</h2>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama (mis. Buka toko)"
            className="flex-1 min-w-[12rem]"
          />
          <Input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Deskripsi (opsional)"
            className="flex-1 min-w-[12rem]"
          />
          <Button type="button" onClick={onCreate} disabled={pending} className="gap-1.5">
            <Plus size={14} />
            Buat
          </Button>
        </div>
      </section>

      {initial.length === 0 && (
        <p className="text-sm text-muted-foreground italic px-1">
          Belum ada checklist. Buat satu di atas.
        </p>
      )}

      {initial.map((cl) => (
        <ChecklistCard
          key={cl.id}
          checklist={cl}
          open={!!open[cl.id]}
          onToggleOpen={() => setOpen((o) => ({ ...o, [cl.id]: !o[cl.id] }))}
          pending={pending}
          run={run}
        />
      ))}
    </div>
  );
}

function ChecklistCard({
  checklist: cl,
  open,
  onToggleOpen,
  pending,
  run,
}: {
  checklist: CleaningChecklist;
  open: boolean;
  onToggleOpen: () => void;
  pending: boolean;
  run: (
    fn: () => Promise<{ ok: true } | { error: string } | { ok: true; id: string }>,
    ok?: string
  ) => void;
}) {
  const [itemTitle, setItemTitle] = useState("");
  const [itemNote, setItemNote] = useState("");
  const [itemPhoto, setItemPhoto] = useState(true);

  const [editingHeader, setEditingHeader] = useState(false);
  const [headerName, setHeaderName] = useState(cl.name);
  const [headerDesc, setHeaderDesc] = useState(cl.description ?? "");

  function startEditHeader() {
    setHeaderName(cl.name);
    setHeaderDesc(cl.description ?? "");
    setEditingHeader(true);
  }

  function saveHeader() {
    const n = headerName.trim();
    if (!n) {
      toast.error("Nama checklist wajib diisi");
      return;
    }
    run(
      () => updateChecklist({ id: cl.id, name: n, description: headerDesc.trim() || null }),
      "Checklist diperbarui"
    );
    setEditingHeader(false);
  }

  function onAddItem() {
    const t = itemTitle.trim();
    if (!t) {
      toast.error("Judul item wajib diisi");
      return;
    }
    run(
      () =>
        addChecklistItem({
          checklist_id: cl.id,
          title: t,
          note: itemNote.trim() || undefined,
          requires_photo: itemPhoto,
        }),
      "Item ditambahkan — buka untuk atur foto"
    );
    setItemTitle("");
    setItemNote("");
    setItemPhoto(true);
  }

  function moveItem(index: number, dir: -1 | 1) {
    const ids = cl.items.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(() => reorderItems({ ordered_ids: ids }));
  }

  return (
    <section
      className={cn(
        "rounded-2xl border bg-card overflow-hidden",
        cl.is_active ? "border-border" : "border-border/60 opacity-70"
      )}
    >
      {editingHeader ? (
        <div className="px-4 py-3 space-y-2">
          <Input
            value={headerName}
            onChange={(e) => setHeaderName(e.target.value)}
            placeholder="Nama checklist (mis. Closing Cleaning)"
          />
          <Textarea
            value={headerDesc}
            onChange={(e) => setHeaderDesc(e.target.value)}
            placeholder="Deskripsi / catatan checklist (opsional)"
            rows={2}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={saveHeader} disabled={pending} className="gap-1.5">
              <Check size={14} />
              Simpan
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditingHeader(false)}
              disabled={pending}
              className="gap-1.5"
            >
              <X size={14} />
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="font-display font-semibold text-sm truncate">
              {cl.name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {cl.items.length} item
            </span>
            {!cl.is_active && (
              <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                nonaktif
              </span>
            )}
          </button>
          <button
            type="button"
            title="Edit nama & deskripsi"
            onClick={startEditHeader}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            title={cl.is_active ? "Nonaktifkan" : "Aktifkan"}
            onClick={() => run(() => setChecklistActive({ id: cl.id, is_active: !cl.is_active }))}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Power size={15} />
          </button>
          <button
            type="button"
            title="Hapus checklist"
            onClick={() => {
              if (confirm(`Hapus checklist "${cl.name}" beserta semua item & assignment-nya?`)) {
                run(() => deleteChecklist({ id: cl.id }), "Checklist dihapus");
              }
            }}
            disabled={pending}
            className="text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}

      {open && (
        <div className="border-t border-border">
          {cl.description && (
            <p className="px-4 pt-2 text-xs text-muted-foreground">{cl.description}</p>
          )}
          <ul className="divide-y divide-border">
            {cl.items.map((it, idx) => (
              <ItemRow
                key={it.id}
                item={it}
                index={idx}
                total={cl.items.length}
                pending={pending}
                run={run}
                onMove={(dir) => moveItem(idx, dir)}
              />
            ))}
            {cl.items.length === 0 && (
              <li className="px-4 py-3 text-xs text-muted-foreground italic">
                Belum ada item.
              </li>
            )}
          </ul>

          {/* Add item */}
          <div className="px-4 py-3 border-t border-border bg-muted/20 space-y-2">
            <Input
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              placeholder="Judul item (mis. Lap meja kasir)"
            />
            <Textarea
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              placeholder="Catatan detail: sisi mana yang dibersihkan & difoto (opsional)"
              rows={2}
            />
            <p className="text-[11px] text-muted-foreground">
              Setelah dibuat, buka item untuk mengatur foto yang diminta &
              referensinya (bisa lebih dari satu).
            </p>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setItemPhoto((p) => !p)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition",
                  itemPhoto
                    ? "bg-accent text-accent-foreground border-foreground"
                    : "bg-card text-muted-foreground border-border"
                )}
              >
                {itemPhoto ? <Camera size={13} /> : <CameraOff size={13} />}
                {itemPhoto ? "Wajib foto" : "Tanpa foto"}
              </button>
              <Button type="button" size="sm" onClick={onAddItem} disabled={pending} className="gap-1.5">
                <Plus size={14} />
                Tambah item
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ItemRow({
  item: it,
  index,
  total,
  pending,
  run,
  onMove,
}: {
  item: CleaningItem;
  index: number;
  total: number;
  pending: boolean;
  run: (
    fn: () => Promise<{ ok: true } | { error: string } | { ok: true; id: string }>,
    ok?: string
  ) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(it.title);
  const [note, setNote] = useState(it.note ?? "");

  function startEdit() {
    setTitle(it.title);
    setNote(it.note ?? "");
    setEditing(true);
  }

  function save() {
    const t = title.trim();
    if (!t) {
      toast.error("Judul item wajib diisi");
      return;
    }
    run(
      () => updateChecklistItem({ id: it.id, title: t, note: note.trim() || null }),
      "Item diperbarui"
    );
    setEditing(false);
  }

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start gap-2">
        {/* Reorder */}
        <div className="flex flex-col -my-0.5 shrink-0">
          <button
            type="button"
            title="Naik"
            onClick={() => onMove(-1)}
            disabled={pending || index === 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            title="Turun"
            onClick={() => onMove(1)}
            disabled={pending || index === total - 1}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        {/* Camera-required toggle */}
        <button
          type="button"
          title={it.requires_photo ? "Wajib foto — klik untuk ubah" : "Tanpa foto — klik untuk ubah"}
          onClick={() =>
            run(() => updateChecklistItem({ id: it.id, requires_photo: !it.requires_photo }))
          }
          disabled={pending || editing}
          className={cn(
            "mt-0.5 shrink-0 disabled:opacity-50",
            it.requires_photo ? "text-accent-foreground" : "text-muted-foreground"
          )}
        >
          {it.requires_photo ? <Camera size={16} /> : <CameraOff size={16} />}
        </button>

        {editing ? (
          <div className="min-w-0 flex-1 space-y-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul item" />
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Catatan detail (opsional)"
              rows={2}
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={save} disabled={pending} className="gap-1.5">
                <Check size={14} />
                Simpan
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
                disabled={pending}
                className="gap-1.5"
              >
                <X size={14} />
                Batal
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{it.title}</p>
              {it.note && (
                <p className="text-xs text-muted-foreground mt-0.5">{it.note}</p>
              )}
            </div>
            {it.requires_photo && (
              <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-muted text-muted-foreground shrink-0">
                {it.photos.length > 0 ? `${it.photos.length} foto` : "1 foto"}
              </span>
            )}
            <button
              type="button"
              title="Edit item"
              onClick={startEdit}
              disabled={pending}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50 shrink-0"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => run(() => deleteChecklistItem({ id: it.id }), "Item dihapus")}
              disabled={pending}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50 shrink-0"
              aria-label="Hapus item"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      {/* Requested photos (slots), each with its own reference */}
      {it.requires_photo && <PhotoSlots item={it} pending={pending} run={run} />}
    </li>
  );
}

function PhotoSlots({
  item,
  pending,
  run,
}: {
  item: CleaningItem;
  pending: boolean;
  run: (
    fn: () => Promise<{ ok: true } | { error: string } | { ok: true; id: string }>,
    ok?: string
  ) => void;
}) {
  const [adding, setAdding] = useState(false);

  async function addWithRef(file: File | undefined) {
    setAdding(true);
    const path = file ? await uploadReferencePhoto(item.id, file) : null;
    setAdding(false);
    run(
      () => addItemPhoto({ item_id: item.id, reference_photo_path: path }),
      "Foto ditambahkan"
    );
  }

  return (
    <div className="mt-2 ml-8 rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Foto yang diminta
      </p>
      {item.photos.length === 0 && (
        <p className="text-[11px] text-muted-foreground italic">
          Default 1 foto (tanpa contoh). Tambah untuk minta beberapa foto, masing-masing
          dengan contoh & nama berbeda.
        </p>
      )}
      {item.photos.map((slot, i) => (
        <SlotRow key={slot.id} slot={slot} itemId={item.id} index={i} pending={pending} run={run} />
      ))}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => addItemPhoto({ item_id: item.id }), "Foto ditambahkan")}
          className="gap-1.5"
        >
          <Plus size={13} />
          Tambah foto
        </Button>
        <label
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-border bg-card cursor-pointer hover:bg-muted",
            (adding || pending) && "opacity-50 pointer-events-none"
          )}
        >
          {adding ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          Tambah + contoh
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={adding || pending}
            onChange={(e) => addWithRef(e.target.files?.[0])}
          />
        </label>
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  itemId,
  index,
  pending,
  run,
}: {
  slot: ItemPhoto;
  itemId: string;
  index: number;
  pending: boolean;
  run: (
    fn: () => Promise<{ ok: true } | { error: string } | { ok: true; id: string }>,
    ok?: string
  ) => void;
}) {
  const [label, setLabel] = useState(slot.label ?? "");
  const [uploading, setUploading] = useState(false);

  async function pickRef(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const path = await uploadReferencePhoto(itemId, file);
    setUploading(false);
    if (path) run(() => updateItemPhoto({ id: slot.id, reference_photo_path: path }), "Contoh disimpan");
  }

  function saveLabel() {
    if (label.trim() !== (slot.label ?? "")) {
      run(() => updateItemPhoto({ id: slot.id, label: label.trim() || null }));
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Reference thumb / upload (click to set or replace) */}
      <label className="relative shrink-0 cursor-pointer" title="Klik untuk set/ganti contoh">
        {slot.reference_photo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={refPublicUrl(slot.reference_photo_path)}
            alt="Contoh"
            className="size-11 rounded-lg border-2 border-foreground object-cover"
          />
        ) : (
          <span className="grid place-items-center size-11 rounded-lg border-2 border-dashed border-border text-muted-foreground">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading || pending}
          onChange={(e) => pickRef(e.target.files?.[0])}
        />
      </label>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={saveLabel}
        placeholder={`Nama foto ${index + 1} (mis. sisi depan)`}
        className="h-8 flex-1"
        disabled={pending}
      />
      {slot.reference_photo_path && (
        <button
          type="button"
          title="Hapus contoh"
          onClick={() =>
            run(() => updateItemPhoto({ id: slot.id, reference_photo_path: null }), "Contoh dihapus")
          }
          disabled={pending}
          className="text-muted-foreground hover:text-destructive disabled:opacity-50 shrink-0 text-[11px]"
        >
          contoh ✕
        </button>
      )}
      <button
        type="button"
        title="Hapus foto ini"
        onClick={() => run(() => deleteItemPhoto({ id: slot.id }), "Foto dihapus")}
        disabled={pending}
        className="text-muted-foreground hover:text-destructive disabled:opacity-50 shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
