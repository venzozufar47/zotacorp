"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X, UserCog } from "lucide-react";
import {
  addStudioHead,
  removeStudioHead,
  type StudioHeadRow,
} from "@/lib/actions/tickets.actions";

interface Eligible {
  id: string;
  full_name: string;
  email: string;
  business_unit: string | null;
}

/** Manajemen allowlist Kepala Studio (admin-only). Mirror AdminsManager. */
export function StudioHeadsManager({
  heads,
  eligible,
}: {
  heads: StudioHeadRow[];
  eligible: Eligible[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [pickedId, setPickedId] = useState("");

  const candidates = useMemo(() => {
    const claimed = new Set(heads.map((h) => h.user_id));
    return eligible.filter((p) => !claimed.has(p.id));
  }, [heads, eligible]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!pickedId) return void toast.error("Pilih karyawan dulu");
    start(async () => {
      const res = await addStudioHead(pickedId);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Kepala Studio ditambahkan");
      setAdding(false);
      setPickedId("");
      router.refresh();
    });
  }

  function onRemove(userId: string, name: string) {
    if (!confirm(`Cabut ${name} sebagai Kepala Studio?`)) return;
    start(async () => {
      const res = await removeStudioHead(userId);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Dicabut");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border-2 border-foreground bg-card p-4 shadow-hard-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display font-bold text-base flex items-center gap-2">
          <UserCog size={17} /> Kepala Studio
        </h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90"
        >
          <Plus size={13} /> Tambah
        </button>
      </div>
      <p className="text-[11.5px] text-muted-foreground -mt-1">
        Karyawan yang menerima & menindaklanjuti tiket studio Yeobo Space.
      </p>

      {heads.length === 0 ? (
        <p className="text-[13px] text-muted-foreground py-3 text-center rounded-xl border border-dashed border-border">
          Belum ada Kepala Studio. Tambah minimal satu agar tiket ada yang menangani.
        </p>
      ) : (
        <div className="space-y-2">
          {heads.map((h) => (
            <div
              key={h.user_id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{h.full_name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {h.business_unit ?? "—"} · {h.email}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(h.user_id, h.full_name)}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive"
                title="Cabut"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <form
            onSubmit={onAdd}
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-card border-2 border-foreground p-5 space-y-4 shadow-hard"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">Tambah Kepala Studio</h3>
              <button type="button" onClick={() => setAdding(false)} className="p-1 rounded hover:bg-muted">
                <X size={16} />
              </button>
            </div>
            <select
              className="w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
              value={pickedId}
              onChange={(e) => setPickedId(e.target.value)}
              required
            >
              <option value="">— Pilih karyawan —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} · {c.business_unit ?? "—"}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="px-4 py-2 rounded-xl border-2 border-border text-sm font-medium hover:bg-muted"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={pending}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Menyimpan…" : "Tambah"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
