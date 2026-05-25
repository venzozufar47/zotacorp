"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import {
  addYeoboBoothAdmin,
  removeYeoboBoothAdmin,
  type YeoboBoothAdminRow,
} from "@/lib/actions/yeobo-booth-admins.actions";

interface Props {
  admins: YeoboBoothAdminRow[];
  eligible: { id: string; full_name: string; email: string }[];
}

const FIELD =
  "w-full rounded-xl border-2 border-foreground/15 bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none transition";

export function AdminsManager({ admins, eligible }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [pickedId, setPickedId] = useState("");
  const [notes, setNotes] = useState("");

  const candidates = useMemo(() => {
    const claimed = new Set(admins.map((a) => a.user_id));
    return eligible.filter((p) => !claimed.has(p.id));
  }, [admins, eligible]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!pickedId) {
      toast.error("Pilih user dulu");
      return;
    }
    start(async () => {
      const res = await addYeoboBoothAdmin({
        user_id: pickedId,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Admin Yeobo Booth ditambahkan");
      setAdding(false);
      setPickedId("");
      setNotes("");
      router.refresh();
    });
  }

  function onRemove(userId: string, name: string) {
    if (!confirm(`Cabut akses ${name}?`)) return;
    start(async () => {
      const res = await removeYeoboBoothAdmin(userId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Akses dicabut");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
        >
          <Plus size={14} /> Tambah Admin
        </button>
      </div>

      {admins.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
          Belum ada admin Yeobo Booth. Tambah karyawan untuk delegasi
          tugas scheduling tanpa harus jadi admin Zota.
        </div>
      ) : (
        <div className="space-y-2">
          {admins.map((a) => (
            <div
              key={a.user_id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="font-semibold text-foreground">
                  {a.full_name}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {a.email}
                  {a.notes && <> · {a.notes}</>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.user_id, a.full_name)}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive"
                title="Cabut akses"
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
            className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-card border border-border p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">
                Tambah Admin Yeobo Booth
              </h3>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="p-1 rounded hover:bg-muted"
              >
                <X size={16} />
              </button>
            </div>
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                User
              </label>
              <select
                className={FIELD}
                value={pickedId}
                onChange={(e) => setPickedId(e.target.value)}
                required
              >
                <option value="">— Pilih user —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Catatan (opsional)
              </label>
              <input
                className={FIELD}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Mis. PIC unit Yeobo Booth"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="px-4 py-2 rounded-xl border-2 border-foreground/20 text-sm font-medium hover:bg-muted"
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
    </div>
  );
}
