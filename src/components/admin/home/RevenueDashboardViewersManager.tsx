"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, X } from "lucide-react";
import {
  addRevenueDashboardViewer,
  removeRevenueDashboardViewer,
  type RevenueDashboardViewerRow,
} from "@/lib/actions/revenue-dashboard-viewers.actions";

const FIELD =
  "w-full rounded-xl border-2 border-foreground/15 bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none transition";

/**
 * Siapa selain admin yang lihat kartu Omzet di beranda mereka sendiri.
 * Collapsed by default — link kecil di bawah kartu Omzet, bukan section
 * yang selalu terbuka (admin jarang perlu ubah ini).
 */
export function RevenueDashboardViewersManager({
  viewers,
  candidates,
}: {
  viewers: RevenueDashboardViewerRow[];
  candidates: { id: string; full_name: string | null; email: string | null }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [pickedId, setPickedId] = useState("");
  const [notes, setNotes] = useState("");

  const available = useMemo(() => {
    const claimed = new Set(viewers.map((v) => v.user_id));
    return candidates.filter((c) => !claimed.has(c.id));
  }, [viewers, candidates]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!pickedId) {
      toast.error("Pilih karyawan dulu");
      return;
    }
    start(async () => {
      const res = await addRevenueDashboardViewer({
        user_id: pickedId,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Ditambahkan — Omzet akan muncul di beranda mereka");
      setPickedId("");
      setNotes("");
      router.refresh();
    });
  }

  function onRemove(userId: string, name: string) {
    if (!confirm(`Cabut akses lihat Omzet dari ${name}?`)) return;
    start(async () => {
      const res = await removeRevenueDashboardViewer(userId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Akses dicabut");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        <Eye size={12} />
        {viewers.length > 0
          ? `Omzet juga terlihat di beranda ${viewers.length} karyawan lain`
          : "Tampilkan Omzet ini di beranda karyawan lain?"}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Eye size={13} /> Siapa yang lihat Omzet di beranda mereka
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1 rounded hover:bg-muted text-muted-foreground"
        >
          <X size={14} />
        </button>
      </div>

      {viewers.length === 0 ? (
        <p className="text-[11.5px] text-muted-foreground italic">
          Belum ada — hanya admin yang lihat kartu ini sekarang.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {viewers.map((v) => (
            <li
              key={v.user_id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
            >
              <div className="min-w-0">
                <span className="font-medium text-foreground">{v.full_name}</span>
                {v.notes && (
                  <span className="text-muted-foreground"> · {v.notes}</span>
                )}
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => onRemove(v.user_id, v.full_name)}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                title="Cabut akses"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 min-w-[180px]">
          <span className="text-[10.5px] text-muted-foreground">Tambah karyawan</span>
          <select
            className={FIELD}
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
          >
            <option value="">— Pilih —</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name ?? "(tanpa nama)"} ({c.email ?? "-"})
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1 min-w-[140px]">
          <span className="text-[10.5px] text-muted-foreground">Catatan (opsional)</span>
          <input
            className={FIELD}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : "Tambah"}
        </button>
      </form>
    </div>
  );
}
