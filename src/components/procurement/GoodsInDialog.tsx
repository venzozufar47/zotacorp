"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatRp } from "@/lib/cashflow/format";
import { parseDecimalId } from "@/components/admin/costing/fields";
import { jakartaDateString } from "@/lib/utils/jakarta";
import { recordGoodsIn } from "@/lib/actions/procurement.actions";
import type { ProcurementRow } from "@/lib/procurement/rows";

/**
 * Catat barang masuk — satu langkah, tanpa dokumen PO.
 *
 * Harga bahan di Master Bahan TIDAK diubah dari sini: harga menggerakkan
 * HPP & margin yang bukan wewenang staf pengadaan. `unit_price_paid`
 * hanya dicatat sebagai harga aktual belanja untuk jejak.
 */
export function GoodsInDialog({
  row,
  pending,
  onClose,
  onDone,
}: {
  row: ProcurementRow;
  pending: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const suggested = row.metrics.suggestion?.qtyPurchaseUnits ?? 0;
  const [qty, setQty] = useState(suggested > 0 ? String(suggested) : "");
  const [price, setPrice] = useState(String(row.material.purchase_price));
  const [supplier, setSupplier] = useState(row.params.supplier ?? "");
  const [date, setDate] = useState(jakartaDateString(new Date()));
  const [notes, setNotes] = useState("");
  const [saving, startTransition] = useTransition();

  const qtyNum = parseDecimalId(qty) ?? 0;
  const priceNum = Number(price.replace(/[^\d]/g, ""));
  const usageQty = qtyNum * row.material.content_per_purchase;

  function submit() {
    if (!(qtyNum > 0)) {
      toast.error("Jumlah harus > 0");
      return;
    }
    startTransition(async () => {
      const res = await recordGoodsIn({
        materialId: row.material.id,
        qtyPurchaseUnits: qtyNum,
        unitPricePaid: Number.isFinite(priceNum) ? priceNum : null,
        supplier: supplier.trim() || null,
        receiptDate: date,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Masuk ${qtyNum} ${row.material.purchase_unit} (${usageQty.toLocaleString("id-ID")} ${row.material.usage_unit})`
      );
      onDone();
    });
  }

  const busy = saving || pending;

  return (
    <div
      className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card border-2 border-foreground shadow-hard p-4 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-semibold text-foreground">{row.material.name}</h2>
          <p className="text-xs text-muted-foreground">
            Catat barang yang SUDAH diterima. Stok langsung bertambah.
          </p>
        </div>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Jumlah ({row.material.purchase_unit})
          </span>
          <input
            autoFocus
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
          />
          {qtyNum > 0 && (
            <span className="text-[11px] text-muted-foreground">
              ≈ {usageQty.toLocaleString("id-ID")} {row.material.usage_unit}
            </span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Harga / {row.material.purchase_unit}
            </span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="numeric"
              className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Tanggal
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Supplier (opsional)
          </span>
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Catatan (opsional)
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
          />
        </label>

        {qtyNum > 0 && Number.isFinite(priceNum) && (
          <p className="text-xs text-muted-foreground tabular-nums">
            Total ≈ <b className="text-foreground">{formatRp(qtyNum * priceNum)}</b>
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Harga di Master Bahan tidak ikut berubah — itu wewenang admin.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-3 rounded-lg border border-border text-sm text-muted-foreground"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex-1 h-10 rounded-lg bg-primary border-2 border-foreground text-sm font-bold disabled:opacity-60"
          >
            {busy ? "Menyimpan…" : "Catat masuk"}
          </button>
        </div>
      </div>
    </div>
  );
}
