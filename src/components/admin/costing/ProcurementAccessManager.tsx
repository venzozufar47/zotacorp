"use client";

/**
 * Admin: penugasan staf pengadaan (per unit bisnis) + setelan global.
 *
 * Aksi memakai `ActionResult` dari `_gates.ts` → periksa `res.ok` sendiri;
 * `useRunAction` menunggu bentuk lama dan akan menganggapnya sukses.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, X } from "lucide-react";
import { NumField } from "@/components/admin/costing/fields";
import {
  setProcurementAssignments,
  updateProcurementSettings,
  type ProcurementStaffRow,
  type EligibleProfileRow,
} from "@/lib/actions/procurement-admin.actions";
import type { ProcurementSettingsLite } from "@/lib/procurement/calc";

export function ProcurementAccessManager({
  brands,
  staff,
  candidates,
  settings,
}: {
  brands: string[];
  staff: ProcurementStaffRow[];
  candidates: EligibleProfileRow[];
  settings: ProcurementSettingsLite;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editFor, setEditFor] = useState<{
    userId: string;
    name: string;
    selected: Set<string>;
  } | null>(null);
  const [adding, setAdding] = useState(false);

  const assignedIds = useMemo(
    () => new Set(staff.map((s) => s.userId)),
    [staff]
  );
  const freeCandidates = useMemo(
    () => candidates.filter((c) => !assignedIds.has(c.id)),
    [candidates, assignedIds]
  );

  function saveSettings(patch: Record<string, number>) {
    startTransition(async () => {
      const res = await updateProcurementSettings(patch);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Setelan disimpan");
      router.refresh();
    });
  }

  function saveAssignment(userId: string, businessUnits: string[]) {
    startTransition(async () => {
      const res = await setProcurementAssignments({ userId, businessUnits });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const d = res.data;
      toast.success(
        d && (d.added || d.removed)
          ? `Akses diperbarui — ${d.added} ditambah, ${d.removed} dicabut`
          : "Tidak ada perubahan"
      );
      setEditFor(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Setelan global */}
      <section className="rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard-sm">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Setelan global
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <NumField
            label="Service level"
            value={settings.serviceLevel * 100}
            decimal
            suffix="%"
            onCommit={(v) => saveSettings({ serviceLevel: v / 100 })}
          />
          <NumField
            label="Biaya sekali pesan"
            value={settings.orderingCost}
            money
            onCommit={(v) => saveSettings({ orderingCost: v })}
          />
          <NumField
            label="Biaya simpan / thn"
            value={settings.holdingRateAnnual * 100}
            decimal
            suffix="%"
            onCommit={(v) => saveSettings({ holdingRateAnnual: v / 100 })}
          />
          <NumField
            label="Periode review"
            value={settings.reviewPeriodDays}
            onCommit={(v) =>
              saveSettings({ reviewPeriodDays: Math.max(1, Math.round(v)) })
            }
            suffix="hr"
          />
          <NumField
            label="Asumsi variasi"
            value={settings.usageCv * 100}
            decimal
            suffix="%"
            onCommit={(v) => saveSettings({ usageCv: v / 100 })}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Service level menentukan seberapa besar safety stock (95% = siap
          melayani 95% permintaan saat lead time). Biaya sekali pesan dipakai
          untuk EOQ — kalau 0, sistem memakai target periodic review.
          &ldquo;Asumsi variasi&rdquo; hanya dipakai untuk bahan yang variasi
          pemakaiannya belum diisi.
        </p>
      </section>

      {/* Staf */}
      <section className="rounded-2xl border-2 border-foreground bg-card p-3 shadow-hard-sm space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Staf pengadaan ({staff.length})
          </h2>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto inline-flex items-center gap-1 h-8 rounded-lg border-2 border-foreground bg-primary px-2 text-[12px] font-bold"
          >
            <Plus size={14} /> Tambah
          </button>
        </div>

        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada staf pengadaan. Karyawan yang ditugaskan akan melihat menu
            &ldquo;Pengadaan&rdquo; dan bisa memantau stok unit bisnisnya.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {staff.map((s) => (
              <li key={s.userId} className="py-2 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[160px]">
                  <div className="text-sm font-semibold">{s.fullName}</div>
                  {s.position && (
                    <div className="text-[11px] text-muted-foreground">
                      {s.position}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {s.businessUnits.map((b) => (
                    <span
                      key={b}
                      className="rounded-full border border-border px-2 py-0.5 text-[11px]"
                    >
                      {b}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditFor({
                      userId: s.userId,
                      name: s.fullName,
                      selected: new Set(s.businessUnits),
                    })
                  }
                  className="h-8 rounded-lg border border-border px-2 text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground"
                >
                  Ubah
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Cabut akses pengadaan ${s.fullName}?`)) return;
                    saveAssignment(s.userId, []);
                  }}
                  className="h-8 rounded-lg px-2 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  title="Cabut semua"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Modal tambah staf */}
      {adding && (
        <Modal onClose={() => setAdding(false)} title="Tambah staf pengadaan">
          {freeCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Semua karyawan aktif sudah ditugaskan.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto divide-y divide-border">
              {freeCandidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setEditFor({
                        userId: c.id,
                        name: c.fullName,
                        selected: new Set(),
                      });
                    }}
                    className="w-full text-left py-2 px-1 hover:bg-muted rounded"
                  >
                    <div className="text-sm font-medium">{c.fullName}</div>
                    {c.position && (
                      <div className="text-[11px] text-muted-foreground">
                        {c.position}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {/* Modal pilih unit bisnis */}
      {editFor && (
        <Modal
          onClose={() => setEditFor(null)}
          title={`Unit bisnis — ${editFor.name}`}
        >
          <p className="text-xs text-muted-foreground">
            Pilih unit bisnis yang jadi tanggung jawabnya. Boleh lebih dari satu.
          </p>
          <div className="flex flex-wrap gap-1.5 py-2">
            {brands.map((b) => {
              const on = editFor.selected.has(b);
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() =>
                    setEditFor((prev) => {
                      if (!prev) return prev;
                      const next = new Set(prev.selected);
                      if (next.has(b)) next.delete(b);
                      else next.add(b);
                      return { ...prev, selected: next };
                    })
                  }
                  className={`h-8 rounded-full border-2 px-3 text-xs font-semibold transition ${
                    on
                      ? "border-foreground bg-primary"
                      : "border-border text-muted-foreground hover:border-foreground"
                  }`}
                >
                  {b}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              saveAssignment(editFor.userId, Array.from(editFor.selected))
            }
            className="w-full h-10 rounded-lg bg-primary border-2 border-foreground text-sm font-bold disabled:opacity-60"
          >
            {pending ? "Menyimpan…" : "Simpan"}
          </button>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card border-2 border-foreground shadow-hard p-4 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <h2 className="font-semibold flex-1">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
