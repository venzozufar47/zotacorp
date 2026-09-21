"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  addCakeFinanceAdmin,
  removeCakeFinanceAdmin,
  type CakeFinanceAdminRow,
} from "@/lib/actions/cake-finance-admins.actions";

const FIELD =
  "w-full rounded-xl border-2 border-foreground/15 bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none transition";

/** Daftar admin Haengbocake yang hanya boleh membuka tab Finance cake. */
export function CakeFinanceAdminsManager({
  admins,
  candidates,
}: {
  admins: CakeFinanceAdminRow[];
  candidates: { id: string; full_name: string | null; email: string | null }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pickedId, setPickedId] = useState("");
  const [notes, setNotes] = useState("");

  const available = useMemo(() => {
    const claimed = new Set(admins.map((a) => a.user_id));
    return candidates.filter((c) => !claimed.has(c.id));
  }, [admins, candidates]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!pickedId) {
      toast.error("Pilih user dulu");
      return;
    }
    start(async () => {
      const res = await addCakeFinanceAdmin({
        user_id: pickedId,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Admin Finance Cake ditambahkan");
      setPickedId("");
      setNotes("");
      router.refresh();
    });
  }

  function onRemove(userId: string, name: string) {
    if (!confirm(`Cabut akses Finance Cake ${name}?`)) return;
    start(async () => {
      const res = await removeCakeFinanceAdmin(userId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Akses dicabut");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div>
        <h3 className="font-semibold text-foreground">
          Admin Haengbocake (khusus Finance)
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Akun di daftar ini bisa membuka tab Finance (rekap pembayaran cake)
          saja — tidak bisa melihat Order, Produksi, Arsip, Opsi, atau Akses.
        </p>
      </div>

      {admins.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Belum ada admin Finance Cake.
        </p>
      ) : (
        <ul className="space-y-2">
          {admins.map((a) => (
            <li
              key={a.user_id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-foreground">{a.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {a.email}
                  {a.notes && <> · {a.notes}</>}
                </div>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => onRemove(a.user_id, a.full_name)}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive"
                title="Cabut akses"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
        <label className="block flex-1 min-w-[200px]">
          <span className="text-xs font-semibold text-muted-foreground">
            Tambah admin
          </span>
          <select
            className={FIELD}
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
          >
            <option value="">— Pilih user —</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name ?? "(tanpa nama)"} ({c.email ?? "-"})
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1 min-w-[160px]">
          <span className="text-xs font-semibold text-muted-foreground">
            Catatan (opsional)
          </span>
          <input
            className={FIELD}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Mis. admin Haengbocake"
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
    </section>
  );
}
