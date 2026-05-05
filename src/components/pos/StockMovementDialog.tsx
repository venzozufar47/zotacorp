"use client";

import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { PosProduct } from "@/lib/actions/pos.actions";
import { createStockMovement } from "@/lib/actions/pos-stock.actions";
import { POS_OPERATION_LABEL_ID } from "@/lib/pos-pin-format";
import { useRouter } from "next/navigation";
import { PosPinAuthDialog } from "./PosPinAuthDialog";

interface Props {
  bankAccountId: string;
  products: PosProduct[];
  type: "production" | "withdrawal";
  /** Designated PIN authorizer for this op. Null = no PIN gate. */
  authorizer: { userId: string; fullName: string } | null;
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
  authorizer,
  onClose,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [skuKey, setSkuKey] = useState("");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

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

  const opLabel = POS_OPERATION_LABEL_ID[type];
  const title = `Tambah ${opLabel}`;

  const sku = options.find((o) => o.key === skuKey);
  const qtyNum = parseInt(qty, 10);
  const previewLabel =
    sku && Number.isFinite(qtyNum) && qtyNum > 0
      ? `${sku.label} ${type === "production" ? "+" : "−"}${qtyNum}`
      : "";

  function submitWithPin(pin: string | undefined) {
    if (!sku) return;
    startTransition(async () => {
      const res = await createStockMovement({
        bankAccountId,
        productId: sku.productId,
        variantId: sku.variantId,
        type,
        qty: qtyNum,
        notes: notes.trim() || undefined,
        pin,
      });
      if (!res.ok) {
        if (pin !== undefined) {
          // PIN failure → keep modal open with shake + error msg
          setPinError(res.error);
        } else {
          toast.error(res.error);
        }
        return;
      }
      toast.success(`${title} tersimpan`);
      setPinOpen(false);
      onClose();
      router.refresh();
    });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku) return toast.error("Pilih SKU dulu");
    if (!Number.isInteger(qtyNum) || qtyNum <= 0)
      return toast.error("Qty harus > 0");
    if (authorizer) {
      setPinError(null);
      setPinOpen(true);
      return;
    }
    submitWithPin(undefined);
  };

  return (
    <div
      className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        // Only close on direct backdrop clicks. Without this guard,
        // clicks bubbling up from inside (e.g. a child portal — see
        // PosPinAuthDialog) would dismiss the dialog unexpectedly.
        if (e.target === e.currentTarget) onClose();
      }}
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

      <PosPinAuthDialog
        open={pinOpen}
        authorizerName={authorizer?.fullName ?? null}
        operationLabel={opLabel}
        preview={previewLabel}
        pending={pending}
        error={pinError}
        onSubmit={(pin) => submitWithPin(pin)}
        onClose={() => {
          if (!pending) {
            setPinOpen(false);
            setPinError(null);
          }
        }}
      />
    </div>
  );
}
