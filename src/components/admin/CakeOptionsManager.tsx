"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  createCakeOption,
  updateCakeOption,
  deleteCakeOption,
  type CakeOptionInput,
} from "@/lib/actions/cake-options.actions";
import { formatIDR } from "@/lib/cashflow/format";
import type { CakeOption, CakeOptionKind } from "@/lib/cake-orders/types";

interface Props {
  initialOptions: CakeOption[];
}

const TABS: Array<{ kind: CakeOptionKind; label: string }> = [
  { kind: "base_cake", label: "Base cake" },
  { kind: "shape", label: "Bentuk" },
  { kind: "filling", label: "Filling" },
  { kind: "delivery", label: "Pengiriman" },
  { kind: "payment_method", label: "Pembayaran" },
];

export function CakeOptionsManager({ initialOptions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeKind, setActiveKind] = useState<CakeOptionKind>("base_cake");
  const [editing, setEditing] = useState<CakeOption | "new" | null>(null);

  const filtered = useMemo(
    () => initialOptions.filter((o) => o.kind === activeKind),
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

      {editing ? (
        <OptionEditor
          key={editing === "new" ? `new-${activeKind}` : editing.id}
          initial={editing === "new" ? null : editing}
          kind={activeKind}
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

      <div className="rounded-2xl border-2 border-foreground bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b-2 border-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Label</th>
              {activeKind === "base_cake" && (
                <th className="text-left px-4 py-2 font-semibold">Harga</th>
              )}
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
                  {activeKind === "base_cake" && (
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      Rp {formatIDR(opt.base_price_idr ?? 0)}
                    </td>
                  )}
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
    </div>
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
  const [basePrice, setBasePrice] = useState(
    String(initial?.base_price_idr ?? 0)
  );
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
      base_price_idr: kind === "base_cake" ? parseInt(basePrice, 10) || 0 : null,
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
        {kind === "base_cake" && (
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Harga (Rp)
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              min={0}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
          </label>
        )}
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
