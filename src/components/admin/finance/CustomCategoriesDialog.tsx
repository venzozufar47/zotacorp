"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks, Plus, X, GripVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setBankAccountCustomCategories } from "@/lib/actions/cashflow.actions";

interface Props {
  bankAccountId: string;
  accountName: string;
  initialCategories: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Admin-managed category dropdown editor. Simple list: add, remove,
 * drag-reorder. Save overwrites the rekening's custom_categories
 * column. On save, a router.refresh makes the new list show up in
 * every dropdown that reads from the rekening's presets.
 */
export function CustomCategoriesDialog({
  bankAccountId,
  accountName,
  initialCategories,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<string[]>(initialCategories);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setItems(initialCategories);
      setDraft("");
    }
  }, [open, initialCategories]);

  function addDraft() {
    const v = draft.trim();
    if (!v) return;
    if (items.includes(v)) {
      toast.error(`"${v}" sudah ada di daftar`);
      return;
    }
    setItems((prev) => [...prev, v]);
    setDraft("");
  }

  function removeAt(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function rename(idx: number, next: string) {
    setItems((prev) => prev.map((v, i) => (i === idx ? next : v)));
  }

  // Simple HTML5 drag-and-drop — small list, no dep needed.
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  function onDragStart(i: number) {
    setDragIdx(i);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function onDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setDragIdx(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const clean = items.map((v) => v.trim()).filter(Boolean);
      const res = await setBankAccountCustomCategories(bankAccountId, clean);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Daftar kategori disimpan");
      router.refresh();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks size={18} />
            Atur kategori dropdown
          </DialogTitle>
          <DialogDescription>
            Rekening <strong>{accountName}</strong>. Daftar ini yang muncul di
            dropdown kategori saat input / edit transaksi. Seret untuk
            reorder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Existing items */}
          <div className="space-y-1">
            {items.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Belum ada kategori. Tambah di bawah.
              </p>
            )}
            {items.map((v, i) => (
              <div
                key={`${v}-${i}`}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(i)}
                className={
                  "flex items-center gap-2 rounded-lg border border-border p-1.5 bg-background " +
                  (dragIdx === i ? "opacity-40" : "")
                }
              >
                <span className="text-muted-foreground cursor-grab">
                  <GripVertical size={12} />
                </span>
                <Input
                  value={v}
                  onChange={(e) => rename(i, e.target.value)}
                  className="flex-1 h-8"
                />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="p-1 rounded-md text-destructive hover:bg-destructive/10"
                  title="Hapus kategori"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Add row */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/60">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDraft();
                }
              }}
              placeholder="Tambah kategori baru…"
              className="flex-1"
            />
            <Button
              type="button"
              size="sm"
              onClick={addDraft}
              disabled={!draft.trim()}
              className="gap-1"
            >
              <Plus size={14} />
              Tambah
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Batal
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
