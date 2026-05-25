"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Power, X } from "lucide-react";
import {
  createFreelance,
  updateFreelance,
  deactivateFreelance,
} from "@/lib/actions/yeobo-booth-freelance.actions";
import { formatIDR } from "@/lib/cashflow/format";
import type { YeoboBoothFreelance } from "@/lib/yeobo-booth/types";

const FIELD =
  "w-full rounded-xl border-2 border-foreground/15 bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none transition";
const LABEL =
  "block text-[12px] font-semibold uppercase tracking-wider text-muted-foreground mb-1";

interface Props {
  freelance: YeoboBoothFreelance[];
}

interface EditingState {
  id: string | null; // null = new
  nama: string;
  no_hp: string;
  fee_per_sesi: string;
  catatan: string;
  aktif: boolean;
}

const BLANK: EditingState = {
  id: null,
  nama: "",
  no_hp: "",
  fee_per_sesi: "",
  catatan: "",
  aktif: true,
};

export function FreelanceManager({ freelance }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<EditingState | null>(null);

  function openNew() {
    setEditing(BLANK);
  }
  function openEdit(f: YeoboBoothFreelance) {
    setEditing({
      id: f.id,
      nama: f.nama,
      no_hp: f.no_hp ?? "",
      fee_per_sesi: f.fee_per_sesi != null ? String(f.fee_per_sesi) : "",
      catatan: f.catatan ?? "",
      aktif: f.aktif,
    });
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const fee = editing.fee_per_sesi
      ? Number(editing.fee_per_sesi.replace(/[^\d]/g, ""))
      : null;
    const payload = {
      nama: editing.nama.trim(),
      no_hp: editing.no_hp.trim() || null,
      fee_per_sesi: fee && Number.isFinite(fee) ? fee : null,
      catatan: editing.catatan.trim() || null,
    };
    start(async () => {
      const res = editing.id
        ? await updateFreelance({
            ...payload,
            id: editing.id,
            aktif: editing.aktif,
          })
        : await createFreelance(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(editing.id ? "Freelance diperbarui" : "Freelance ditambah");
      setEditing(null);
      router.refresh();
    });
  }

  function onDeactivate(id: string) {
    if (!confirm("Non-aktifkan freelance? Booking historis tetap utuh.")) return;
    start(async () => {
      const res = await deactivateFreelance(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Dinon-aktifkan");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
        >
          <Plus size={14} /> Tambah Freelance
        </button>
      </div>

      {freelance.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
          Belum ada freelance.
        </div>
      ) : (
        <div className="space-y-2">
          {freelance.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {f.nama}
                  </span>
                  {!f.aktif && (
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      non-aktif
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {f.no_hp ?? "—"}
                  {f.fee_per_sesi != null &&
                    ` · Fee ${formatIDR(f.fee_per_sesi)}/sesi`}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(f)}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                {f.aktif && (
                  <button
                    type="button"
                    onClick={() => onDeactivate(f.id)}
                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive"
                    title="Non-aktifkan"
                  >
                    <Power size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <form
            onSubmit={onSave}
            className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-card border border-border p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-lg">
                {editing.id ? "Edit Freelance" : "Tambah Freelance"}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1 rounded hover:bg-muted"
              >
                <X size={16} />
              </button>
            </div>
            <div>
              <label className={LABEL}>Nama *</label>
              <input
                className={FIELD}
                required
                value={editing.nama}
                onChange={(e) =>
                  setEditing({ ...editing, nama: e.target.value })
                }
              />
            </div>
            <div>
              <label className={LABEL}>No HP</label>
              <input
                className={FIELD}
                value={editing.no_hp}
                onChange={(e) =>
                  setEditing({ ...editing, no_hp: e.target.value })
                }
              />
            </div>
            <div>
              <label className={LABEL}>Fee per Sesi (IDR)</label>
              <input
                inputMode="numeric"
                className={FIELD}
                value={editing.fee_per_sesi}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    fee_per_sesi: e.target.value.replace(/[^\d]/g, ""),
                  })
                }
                placeholder="Opsional, info saja"
              />
            </div>
            <div>
              <label className={LABEL}>Catatan</label>
              <textarea
                className={FIELD + " min-h-20"}
                value={editing.catatan}
                onChange={(e) =>
                  setEditing({ ...editing, catatan: e.target.value })
                }
              />
            </div>
            {editing.id && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.aktif}
                  onChange={(e) =>
                    setEditing({ ...editing, aktif: e.target.checked })
                  }
                />
                Aktif
              </label>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-xl border-2 border-foreground/20 text-sm font-medium hover:bg-muted"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={pending}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
