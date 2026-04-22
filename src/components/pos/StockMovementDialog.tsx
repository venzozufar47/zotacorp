"use client";

import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { PosProduct } from "@/lib/actions/pos.actions";
import { createStockMovement } from "@/lib/actions/pos-stock.actions";
import { useRouter } from "next/navigation";

interface Props {
  bankAccountId: string;
  products: PosProduct[];
  type: "production" | "withdrawal";
  onClose: () => void;
}

/** Opsi flat: produk tanpa varian → 1 opsi, produk dengan varian → 1 opsi per varian. */
interface SkuOption {
  key: string;
  label: string;
  productId: string;
  variantId: string | null;
}

export function StockMovementDialog({
  bankAccountId,
  products,
  type,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [skuKey, setSkuKey] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");

  const options = useMemo<SkuOption[]>(() => {
    const out: SkuOption[] = [];
    for (const p of products) {
      if (p.variants.length === 0) {
        out.push({ key: `p:${p.id}`, label: p.name, productId: p.id, variantId: null });
      } else {
        for (const v of p.variants) {
          out.push({
            key: `p:${p.id}|v:${v.id}`,
            label: `${p.name} · ${v.name}`,
            productId: p.id,
            variantId: v.id,
          });
        }
      }
    }
    return out;
  }, [products]);

  const title = type === "production" ? "Tambah Produksi" : "Tambah Penarikan";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sku = options.find((o) => o.key === skuKey);
    if (!sku) return toast.error("Pilih SKU dulu");
    const qtyNum = parseInt(qty, 10);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0)
      return toast.error("Qty harus > 0");

    startTransition(async () => {
      const res = await createStockMovement({
        bankAccountId,
        productId: sku.productId,
        variantId: sku.variantId,
        type,
        qty: qtyNum,
        notes: notes.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${title} tersimpan`);
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-card border border-border p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted"
            aria-label="Tutup"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">SKU</span>
            <select
              value={skuKey}
              onChange={(e) => setSkuKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              required
            >
              <option value="">-- pilih produk --</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Qty</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
              required
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Catatan {type === "withdrawal" ? "(opsional · expired / rusak / testing)" : "(opsional)"}
            </span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
