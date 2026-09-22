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
import type { RevenueDashboardScope } from "@/lib/revenue-dashboard/access";

const FIELD =
  "w-full rounded-xl border-2 border-foreground/15 bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none transition";

const SCOPE_LABEL: Record<RevenueDashboardScope, string> = {
  haengbocake: "Haengbocake (POS + Cake)",
  yeobo: "Yeobo Space",
};

/**
 * Siapa selain admin yang lihat kartu Omzet di beranda mereka sendiri —
 * di-assign TERPISAH per scope (Haengbocake / Yeobo Space), supaya
 * manajer satu unit tidak otomatis lihat omzet unit lain. Collapsed by
 * default — link kecil di bawah kartu Omzet, bukan section yang selalu
 * terbuka.
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
  const [scope, setScope] = useState<RevenueDashboardScope>("haengbocake");
  const [notes, setNotes] = useState("");

  const byScope = useMemo(() => {
    const map: Record<RevenueDashboardScope, RevenueDashboardViewerRow[]> = {
      haengbocake: [],
      yeobo: [],
    };
    for (const v of viewers) map[v.scope].push(v);
    return map;
  }, [viewers]);

  const available = useMemo(() => {
    const claimed = new Set(
      viewers.filter((v) => v.scope === scope).map((v) => v.user_id)
    );
    return candidates.filter((c) => !claimed.has(c.id));
  }, [viewers, candidates, scope]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!pickedId) {
      toast.error("Pilih karyawan dulu");
      return;
    }
    start(async () => {
      const res = await addRevenueDashboardViewer({
        user_id: pickedId,
        scope,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Omzet ${SCOPE_LABEL[scope]} akan muncul di beranda mereka`);
      setPickedId("");
      setNotes("");
      router.refresh();
    });
  }

  function onRemove(userId: string, scope: RevenueDashboardScope, name: string) {
    if (!confirm(`Cabut akses lihat Omzet ${SCOPE_LABEL[scope]} dari ${name}?`)) return;
    start(async () => {
      const res = await removeRevenueDashboardViewer(userId, scope);
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
          ? `Omzet juga terlihat di beranda ${viewers.length} penugasan karyawan`
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

      {(["haengbocake", "yeobo"] as const).map((s) => (
        <div key={s} className="space-y-1.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {SCOPE_LABEL[s]}
          </p>
          {byScope[s].length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">
              Belum ada — hanya admin yang lihat.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {byScope[s].map((v) => (
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
                    onClick={() => onRemove(v.user_id, v.scope, v.full_name)}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                    title="Cabut akses"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2 pt-1 border-t border-border/60">
        <label className="block min-w-[160px]">
          <span className="text-[10.5px] text-muted-foreground">Scope</span>
          <select
            className={FIELD}
            value={scope}
            onChange={(e) => setScope(e.target.value as RevenueDashboardScope)}
          >
            <option value="haengbocake">{SCOPE_LABEL.haengbocake}</option>
            <option value="yeobo">{SCOPE_LABEL.yeobo}</option>
          </select>
        </label>
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
