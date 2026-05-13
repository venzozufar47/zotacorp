"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Save, X, Trash } from "lucide-react";
import { toast } from "sonner";
import {
  createCakeOption,
  updateCakeOption,
  deleteCakeOption,
  createCakeDiameter,
  updateCakeDiameter,
  deleteCakeDiameter,
  setCakeBasePricesBulk,
  type CakeBasePriceChange,
  type CakeOptionInput,
  type CakeDiameterInput,
} from "@/lib/actions/cake-options.actions";
import type {
  CakeBaseDiameterPrice,
  CakeBranch,
  CakeDiameterOption,
  CakeOption,
  CakeOptionKind,
} from "@/lib/cake-orders/types";
import { CAKE_BRANCH_LABELS } from "@/lib/cake-orders/types";

interface Props {
  initialOptions: CakeOption[];
  initialDiameters: CakeDiameterOption[];
  initialPrices: CakeBaseDiameterPrice[];
}

type TabKey = CakeOptionKind | "diameter";

const TABS: Array<{ kind: TabKey; label: string }> = [
  { kind: "base_cake", label: "Base cake" },
  { kind: "diameter", label: "Diameter" },
  { kind: "shape", label: "Bentuk" },
  { kind: "filling", label: "Filling" },
  { kind: "delivery", label: "Pengiriman" },
  { kind: "payment_method", label: "Pembayaran" },
];

export function CakeOptionsManager({
  initialOptions,
  initialDiameters,
  initialPrices,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeKind, setActiveKind] = useState<TabKey>("base_cake");
  const [editing, setEditing] = useState<CakeOption | "new" | null>(null);
  const [editingDia, setEditingDia] = useState<
    CakeDiameterOption | "new" | null
  >(null);

  const filtered = useMemo(
    () =>
      activeKind === "diameter"
        ? []
        : initialOptions.filter((o) => o.kind === activeKind),
    [initialOptions, activeKind]
  );

  const onSave = (input: CakeOptionInput) => {
    const target = editing;
    if (target === null) return;
    startTransition(async () => {
      const isNew = target === "new";
      const res = isNew
        ? await createCakeOption(input)
        : await updateCakeOption(target.id, input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isNew ? "Opsi dibuat" : "Opsi diperbarui");
      setEditing(null);
      router.refresh();
    });
  };

  const onDelete = (opt: CakeOption) => {
    if (!confirm(`Hapus opsi "${opt.label}"?`)) return;
    startTransition(async () => {
      const res = await deleteCakeOption(opt.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Opsi dihapus / dinonaktifkan");
      router.refresh();
    });
  };

  const onSaveDia = (input: CakeDiameterInput) => {
    const target = editingDia;
    if (target === null) return;
    startTransition(async () => {
      const isNew = target === "new";
      const res = isNew
        ? await createCakeDiameter(input)
        : await updateCakeDiameter(target.id, input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isNew ? "Diameter dibuat" : "Diameter diperbarui");
      setEditingDia(null);
      router.refresh();
    });
  };

  const onDeleteDia = (d: CakeDiameterOption) => {
    if (
      !confirm(
        `Hapus diameter ${d.diameter_cm} cm? Semua harga matriks yang merujuk ikut hilang.`
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteCakeDiameter(d.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Diameter dihapus");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => {
              setActiveKind(t.kind);
              setEditing(null);
              setEditingDia(null);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium border-2 transition-colors ${
              activeKind === t.kind
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-muted-foreground border-border hover:border-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeKind === "diameter" ? (
        editingDia ? (
          <DiameterEditor
            key={editingDia === "new" ? "new-dia" : editingDia.id}
            initial={editingDia === "new" ? null : editingDia}
            pending={pending}
            onSave={onSaveDia}
            onCancel={() => setEditingDia(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingDia("new")}
            className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} strokeWidth={2.5} />
            Tambah diameter
          </button>
        )
      ) : editing ? (
        <OptionEditor
          key={editing === "new" ? `new-${activeKind}` : editing.id}
          initial={editing === "new" ? null : editing}
          kind={activeKind as CakeOptionKind}
          pending={pending}
          onSave={onSave}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-4 py-2 text-sm font-medium"
        >
          <Plus size={16} strokeWidth={2.5} />
          Tambah {TABS.find((t) => t.kind === activeKind)?.label.toLowerCase()}
        </button>
      )}

      {activeKind === "diameter" ? (
        <DiameterList
          diameters={initialDiameters}
          pending={pending}
          onEdit={setEditingDia}
          onDelete={onDeleteDia}
        />
      ) : (
      <div className="rounded-2xl border-2 border-foreground bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b-2 border-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Label</th>
              {activeKind === "delivery" && (
                <th className="text-left px-4 py-2 font-semibold">Alamat?</th>
              )}
              {activeKind === "shape" && (
                <th className="text-left px-4 py-2 font-semibold">Custom?</th>
              )}
              <th className="text-left px-4 py-2 font-semibold">Status</th>
              <th className="text-left px-4 py-2 font-semibold">Urutan</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Belum ada opsi. Klik &quot;Tambah&quot; di atas.
                </td>
              </tr>
            ) : (
              filtered.map((opt) => (
                <tr key={opt.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {opt.label}
                  </td>
                  {activeKind === "delivery" && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {opt.needs_address ? "Ya" : "—"}
                    </td>
                  )}
                  {activeKind === "shape" && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {opt.is_custom_freeform ? "Ya" : "—"}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    {opt.is_active ? (
                      <span className="inline-block rounded-full bg-pop-emerald/20 text-foreground border border-foreground px-2 py-0.5 text-xs font-medium">
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-xs font-medium">
                        Nonaktif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {opt.sort_order}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(opt)}
                        disabled={pending}
                        className="flex items-center gap-1 rounded-lg border-2 border-foreground bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        <Pencil size={12} strokeWidth={2.5} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(opt)}
                        disabled={pending}
                        className="flex items-center gap-1 rounded-lg border-2 border-foreground bg-destructive text-destructive-foreground px-2.5 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        <Trash2 size={12} strokeWidth={2.5} />
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {activeKind === "base_cake" && (
        <PriceMatrix
          bases={initialOptions.filter((o) => o.kind === "base_cake")}
          diameters={initialDiameters.filter((d) => d.is_active)}
          prices={initialPrices}
          pending={pending}
        />
      )}
    </div>
  );
}

function DiameterList({
  diameters,
  pending,
  onEdit,
  onDelete,
}: {
  diameters: CakeDiameterOption[];
  pending: boolean;
  onEdit: (d: CakeDiameterOption) => void;
  onDelete: (d: CakeDiameterOption) => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-foreground bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b-2 border-foreground">
          <tr>
            <th className="text-left px-4 py-2 font-semibold">Diameter</th>
            <th className="text-left px-4 py-2 font-semibold">Label</th>
            <th className="text-left px-4 py-2 font-semibold">Status</th>
            <th className="text-left px-4 py-2 font-semibold">Urutan</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {diameters.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="px-4 py-8 text-center text-muted-foreground"
              >
                Belum ada diameter. Klik &quot;Tambah&quot; di atas.
              </td>
            </tr>
          ) : (
            diameters.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 font-medium text-foreground tabular-nums">
                  {d.diameter_cm} cm
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {d.label ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {d.is_active ? (
                    <span className="inline-block rounded-full bg-pop-emerald/20 text-foreground border border-foreground px-2 py-0.5 text-xs font-medium">
                      Aktif
                    </span>
                  ) : (
                    <span className="inline-block rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-xs font-medium">
                      Nonaktif
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {d.sort_order}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(d)}
                      disabled={pending}
                      className="flex items-center gap-1 rounded-lg border-2 border-foreground bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      <Pencil size={12} strokeWidth={2.5} />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(d)}
                      disabled={pending}
                      className="flex items-center gap-1 rounded-lg border-2 border-foreground bg-destructive text-destructive-foreground px-2.5 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      <Trash2 size={12} strokeWidth={2.5} />
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function DiameterEditor({
  initial,
  pending,
  onSave,
  onCancel,
}: {
  initial: CakeDiameterOption | null;
  pending: boolean;
  onSave: (input: CakeDiameterInput) => void;
  onCancel: () => void;
}) {
  const [diameterCm, setDiameterCm] = useState(
    String(initial?.diameter_cm ?? "")
  );
  const [label, setLabel] = useState(initial?.label ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      diameter_cm: parseInt(diameterCm, 10) || 0,
      label: label.trim() || null,
      sort_order: parseInt(sortOrder, 10) || 0,
      is_active: isActive,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border-2 border-foreground bg-card p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">
          {initial ? `Edit — ${initial.diameter_cm} cm` : "Diameter baru"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label="Tutup"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Diameter (cm)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={199}
            value={diameterCm}
            onChange={(e) => setDiameterCm(e.target.value.replace(/[^\d]/g, ""))}
            required
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Label (opsional)
          </span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="default: '{N} cm'"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Urutan
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="flex items-center gap-2 mt-5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4"
          />
          <span className="text-sm text-foreground">Aktif</span>
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 sm:flex-none rounded-xl border-2 border-foreground bg-card px-4 py-2 text-sm font-medium"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Save size={14} strokeWidth={2.5} />
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}

/**
 * Matriks harga (base × diameter). Sel kosong = harga belum diset →
 * order form akan minta admin isi harga manual. Setiap input
 * autosave saat blur.
 */
function PriceMatrix({
  bases,
  diameters,
  prices,
  pending,
}: {
  bases: CakeOption[];
  diameters: CakeDiameterOption[];
  prices: CakeBaseDiameterPrice[];
  pending: boolean;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  /** Original prices dari server — referensi "saved state". */
  const priceMap = useMemo(() => {
    const m = new Map<
      string,
      { pare: number | null; semarang: number | null }
    >();
    for (const p of prices)
      m.set(`${p.base_option_id}:${p.diameter_id}`, {
        pare: p.price_pare_idr,
        semarang: p.price_semarang_idr,
      });
    return m;
  }, [prices]);

  /** Edit lokal yang belum disimpan. Key: "{baseId}:{diaId}:{branch}",
   *  value: harga baru (null = clear). Tidak ada entry = unchanged. */
  const [dirty, setDirty] = useState<Map<string, number | null>>(new Map());

  // Reset dirty saat data server berubah (router.refresh sesudah save).
  useEffect(() => {
    setDirty(new Map());
  }, [prices]);

  if (bases.length === 0 || diameters.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        {bases.length === 0
          ? "Tambah base cake dulu di tab ini."
          : "Tambah preset diameter di tab Diameter dulu untuk mulai mengisi matriks harga."}
      </div>
    );
  }

  const dirtyKey = (baseId: string, diaId: string, branch: CakeBranch) =>
    `${baseId}:${diaId}:${branch}`;

  const onCellChange = (
    baseId: string,
    diaId: string,
    branch: CakeBranch,
    raw: string,
    saved: number | null
  ) => {
    const trimmed = raw.trim();
    const next =
      trimmed === ""
        ? null
        : Math.max(0, parseInt(trimmed.replace(/\D/g, ""), 10) || 0);
    const k = dirtyKey(baseId, diaId, branch);
    setDirty((prev) => {
      const m = new Map(prev);
      if (next === saved) m.delete(k);
      else m.set(k, next);
      return m;
    });
  };

  const dirtyCount = dirty.size;

  const dirtyToChanges = (): CakeBasePriceChange[] => {
    const out: CakeBasePriceChange[] = [];
    for (const [k, v] of dirty) {
      const [baseId, diaId, branch] = k.split(":") as [
        string,
        string,
        CakeBranch,
      ];
      out.push({
        base_option_id: baseId,
        diameter_id: diaId,
        branch,
        price_idr: v,
      });
    }
    return out;
  };

  const onSaveAll = () => {
    if (dirtyCount === 0) return;
    const changes = dirtyToChanges();
    startSave(async () => {
      const res = await setCakeBasePricesBulk(changes);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Tersimpan · ${dirtyCount} perubahan`);
      router.refresh();
    });
  };

  const onDiscard = () => {
    if (dirtyCount === 0) return;
    setDirty(new Map());
  };

  /** Flush dirty cells ke server lalu jalankan callback. Dipakai saat
   *  admin melakukan structural change (add/remove base/diameter) yang
   *  akan men-trigger refresh dan mereset dirty state. */
  const withDirtyFlushed = (after: () => Promise<void>) => {
    startSave(async () => {
      if (dirtyCount > 0) {
        const res = await setCakeBasePricesBulk(dirtyToChanges());
        if (!res.ok) {
          toast.error(`Gagal menyimpan perubahan: ${res.error}`);
          return;
        }
      }
      await after();
    });
  };

  const onAddBase = () => {
    const label = window.prompt("Nama base cake baru:")?.trim();
    if (!label) return;
    const sort = (bases[bases.length - 1]?.sort_order ?? 0) + 10;
    withDirtyFlushed(async () => {
      const res = await createCakeOption({
        kind: "base_cake",
        label,
        base_price_idr: null,
        needs_address: false,
        is_custom_freeform: false,
        sort_order: sort,
        is_active: true,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Base cake ditambah");
      router.refresh();
    });
  };

  const onAddDiameter = () => {
    const raw = window
      .prompt("Diameter baru (cm) atau label custom (mis. 18, Bento):")
      ?.trim();
    if (!raw) return;
    const cm = parseInt(raw.replace(/[^\d]/g, ""), 10);
    const labelPart = raw.replace(/\d/g, "").trim();
    if (!Number.isFinite(cm) || cm < 1 || cm > 199) {
      toast.error("Diameter harus mengandung angka 1–199");
      return;
    }
    const sort = (diameters[diameters.length - 1]?.sort_order ?? 0) + 10;
    withDirtyFlushed(async () => {
      const res = await createCakeDiameter({
        diameter_cm: cm,
        label: labelPart || null,
        sort_order: sort,
        is_active: true,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Diameter ditambah");
      router.refresh();
    });
  };

  const onDeleteBaseInline = (b: CakeOption) => {
    if (
      !window.confirm(
        `Hapus base cake "${b.label}"? Harga matriks untuk base ini ikut hilang.`
      )
    )
      return;
    withDirtyFlushed(async () => {
      const res = await deleteCakeOption(b.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`"${b.label}" dihapus`);
      router.refresh();
    });
  };

  const onDeleteDiameterInline = (d: CakeDiameterOption) => {
    const label = d.label ?? `${d.diameter_cm} cm`;
    if (
      !window.confirm(
        `Hapus diameter "${label}"? Harga matriks untuk diameter ini ikut hilang.`
      )
    )
      return;
    withDirtyFlushed(async () => {
      const res = await deleteCakeDiameter(d.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Diameter "${label}" dihapus`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground">
          Matriks harga · base × diameter
        </h3>
        <div className="flex items-center gap-1.5">
          {dirtyCount > 0 && (
            <>
              <span className="text-[11px] text-muted-foreground">
                {dirtyCount} perubahan belum disimpan
              </span>
              <button
                type="button"
                onClick={onDiscard}
                disabled={pending || saving}
                className="rounded-lg border-2 border-foreground bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                Batalkan
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onSaveAll}
            disabled={pending || saving || dirtyCount === 0}
            className="flex items-center gap-1.5 rounded-lg border-2 border-foreground bg-primary text-primary-foreground px-3 py-1 text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={12} strokeWidth={2.5} />
            {saving ? "Menyimpan…" : "Simpan"}
            {dirtyCount > 0 && !saving && (
              <span className="ml-0.5 inline-flex items-center justify-center rounded-full bg-foreground text-background px-1.5 min-w-[1.25rem] text-[10px] tabular-nums">
                {dirtyCount}
              </span>
            )}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
        Tiap sel berisi 2 harga:
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex items-center justify-center size-4 rounded-full bg-pop-emerald text-foreground border border-foreground text-[9px] font-bold">
            P
          </span>
          {CAKE_BRANCH_LABELS.pare}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex items-center justify-center size-4 rounded-full bg-pop-pink text-foreground border border-foreground text-[9px] font-bold">
            S
          </span>
          {CAKE_BRANCH_LABELS.semarang}
        </span>
        <span className="basis-full text-[11px]">
          Kosongkan kalau kombinasi tidak punya harga preset — admin akan
          isi manual di form order.
        </span>
      </p>
      <div className="rounded-2xl border-2 border-foreground bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b-2 border-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted/50 z-10">
                Base \\ Diameter
              </th>
              {diameters.map((d) => (
                <th
                  key={d.id}
                  className="text-left px-3 py-2 font-semibold tabular-nums whitespace-nowrap group"
                >
                  <span className="inline-flex items-center gap-1">
                    {d.label ?? `${d.diameter_cm} cm`}
                    <button
                      type="button"
                      onClick={() => onDeleteDiameterInline(d)}
                      disabled={pending || saving}
                      title={`Hapus diameter ${d.label ?? `${d.diameter_cm} cm`}`}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded-full p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </span>
                </th>
              ))}
              <th className="px-2 py-2 text-left">
                <button
                  type="button"
                  onClick={onAddDiameter}
                  disabled={pending || saving}
                  className="inline-flex items-center gap-1 rounded-lg border-2 border-dashed border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-50 whitespace-nowrap"
                >
                  <Plus size={12} strokeWidth={2.5} />
                  Diameter
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {bases.map((b) => (
              <tr key={b.id} className="border-b border-border last:border-b-0 group">
                <td className="px-3 py-2 font-medium text-foreground sticky left-0 bg-card whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    {b.label}
                    <button
                      type="button"
                      onClick={() => onDeleteBaseInline(b)}
                      disabled={pending || saving}
                      title={`Hapus ${b.label}`}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded-full p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash size={11} strokeWidth={2.5} />
                    </button>
                  </span>
                </td>
                {diameters.map((d) => {
                  const key = `${b.id}:${d.id}`;
                  const cell = priceMap.get(key);
                  const savedPare = cell?.pare ?? null;
                  const savedSem = cell?.semarang ?? null;
                  const dirtyPareKey = dirtyKey(b.id, d.id, "pare");
                  const dirtySemKey = dirtyKey(b.id, d.id, "semarang");
                  const pareVal = dirty.has(dirtyPareKey)
                    ? dirty.get(dirtyPareKey) ?? null
                    : savedPare;
                  const semVal = dirty.has(dirtySemKey)
                    ? dirty.get(dirtySemKey) ?? null
                    : savedSem;
                  return (
                    <td key={d.id} className="px-2 py-1">
                      <DualPriceCell
                        pareValue={pareVal}
                        semarangValue={semVal}
                        pareDirty={dirty.has(dirtyPareKey)}
                        semarangDirty={dirty.has(dirtySemKey)}
                        disabled={pending || saving}
                        onChange={(branch, raw) =>
                          onCellChange(
                            b.id,
                            d.id,
                            branch,
                            raw,
                            branch === "pare" ? savedPare : savedSem
                          )
                        }
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-1" aria-hidden="true" />
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2 sticky left-0 bg-card">
                <button
                  type="button"
                  onClick={onAddBase}
                  disabled={pending || saving}
                  className="inline-flex items-center gap-1 rounded-lg border-2 border-dashed border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-50 whitespace-nowrap"
                >
                  <Plus size={12} strokeWidth={2.5} />
                  Base
                </button>
              </td>
              <td colSpan={diameters.length + 1} aria-hidden="true" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DualPriceCell({
  pareValue,
  semarangValue,
  pareDirty,
  semarangDirty,
  disabled,
  onChange,
}: {
  pareValue: number | null;
  semarangValue: number | null;
  pareDirty: boolean;
  semarangDirty: boolean;
  disabled: boolean;
  onChange: (branch: CakeBranch, raw: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span
          className="inline-flex items-center justify-center size-4 rounded-full bg-pop-emerald text-foreground border border-foreground text-[9px] font-bold shrink-0"
          title="Pare"
        >
          P
        </span>
        <BranchPriceInput
          value={pareValue}
          dirty={pareDirty}
          disabled={disabled}
          onChange={(raw) => onChange("pare", raw)}
        />
      </div>
      <div className="flex items-center gap-1">
        <span
          className="inline-flex items-center justify-center size-4 rounded-full bg-pop-pink text-foreground border border-foreground text-[9px] font-bold shrink-0"
          title="Semarang"
        >
          S
        </span>
        <BranchPriceInput
          value={semarangValue}
          dirty={semarangDirty}
          disabled={disabled}
          onChange={(raw) => onChange("semarang", raw)}
        />
      </div>
    </div>
  );
}

function BranchPriceInput({
  value,
  dirty,
  disabled,
  onChange,
}: {
  value: number | null;
  dirty: boolean;
  disabled: boolean;
  onChange: (raw: string) => void;
}) {
  const text = value == null ? "" : String(value);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      placeholder="—"
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      className={`w-20 rounded-lg border bg-background px-1.5 py-0.5 text-[11px] tabular-nums focus:border-foreground ${
        dirty
          ? "border-foreground ring-2 ring-primary/40 font-semibold"
          : "border-border"
      }`}
    />
  );
}

function OptionEditor({
  initial,
  kind,
  pending,
  onSave,
  onCancel,
}: {
  initial: CakeOption | null;
  kind: CakeOptionKind;
  pending: boolean;
  onSave: (input: CakeOptionInput) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [needsAddress, setNeedsAddress] = useState(
    initial?.needs_address ?? false
  );
  const [isCustomFreeform, setIsCustomFreeform] = useState(
    initial?.is_custom_freeform ?? false
  );
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      kind,
      label,
      base_price_idr: null,
      needs_address: kind === "delivery" ? needsAddress : false,
      is_custom_freeform: kind === "shape" ? isCustomFreeform : false,
      sort_order: parseInt(sortOrder, 10) || 0,
      is_active: isActive,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border-2 border-foreground bg-card p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">
          {initial ? `Edit — ${initial.label}` : "Opsi baru"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted"
          aria-label="Tutup"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Label</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        {kind === "delivery" && (
          <label className="flex items-center gap-2 mt-5">
            <input
              type="checkbox"
              checked={needsAddress}
              onChange={(e) => setNeedsAddress(e.target.checked)}
              className="size-4"
            />
            <span className="text-sm text-foreground">
              Butuh alamat (Maxim Bike / Car)
            </span>
          </label>
        )}
        {kind === "shape" && (
          <label className="flex items-center gap-2 mt-5">
            <input
              type="checkbox"
              checked={isCustomFreeform}
              onChange={(e) => setIsCustomFreeform(e.target.checked)}
              className="size-4"
            />
            <span className="text-sm text-foreground">
              Custom — tampilkan input teks
            </span>
          </label>
        )}
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">
            Urutan
          </span>
          <input
            type="number"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="flex items-center gap-2 mt-5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4"
          />
          <span className="text-sm text-foreground">Aktif</span>
        </label>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 sm:flex-none rounded-xl border-2 border-foreground bg-card px-4 py-2 text-sm font-medium"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground border-2 border-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Save size={14} strokeWidth={2.5} />
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
