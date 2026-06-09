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
  Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createChecklist,
  deleteChecklist,
  setChecklistActive,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  type CleaningChecklist,
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
      "Item ditambahkan"
    );
    setItemTitle("");
    setItemNote("");
    setItemPhoto(true);
  }

  return (
    <section
      className={cn(
        "rounded-2xl border bg-card overflow-hidden",
        cl.is_active ? "border-border" : "border-border/60 opacity-70"
      )}
    >
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

      {open && (
        <div className="border-t border-border">
          {cl.description && (
            <p className="px-4 pt-2 text-xs text-muted-foreground">{cl.description}</p>
          )}
          <ul className="divide-y divide-border">
            {cl.items.map((it) => (
              <li key={it.id} className="px-4 py-2.5 flex items-start gap-3">
                <button
                  type="button"
                  title={it.requires_photo ? "Wajib foto — klik untuk ubah" : "Tanpa foto — klik untuk ubah"}
                  onClick={() =>
                    run(() =>
                      updateChecklistItem({ id: it.id, requires_photo: !it.requires_photo })
                    )
                  }
                  disabled={pending}
                  className={cn(
                    "mt-0.5 shrink-0",
                    it.requires_photo ? "text-accent-foreground" : "text-muted-foreground"
                  )}
                >
                  {it.requires_photo ? <Camera size={16} /> : <CameraOff size={16} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{it.title}</p>
                  {it.note && (
                    <p className="text-xs text-muted-foreground mt-0.5">{it.note}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => run(() => deleteChecklistItem({ id: it.id }), "Item dihapus")}
                  disabled={pending}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50 shrink-0"
                  aria-label="Hapus item"
                >
                  <Trash2 size={14} />
                </button>
              </li>
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
