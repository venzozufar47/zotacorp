"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { updateCakeOrderBilling } from "@/lib/actions/cake-orders.actions";
import { AddOnsTable } from "./NewCakeOrderForm";
import type { CakeAddOnLine, CakeOrder } from "@/lib/cake-orders/types";

/**
 * Editor minimal untuk 3 field administratif yang TETAP boleh diubah
 * setelah cake diproduksi/dikirim: nama pemesan, harga add-ons, ongkir.
 * Spesifikasi kue tidak ada di sini (terkunci by design). Server
 * (`updateCakeOrderBilling`) menghitung ulang total.
 *
 * `showOngkir` false saat order pickup (needs_address=false) — ongkir
 * dipaksa 0 di server, jadi field-nya tidak ditampilkan.
 */
export function CakeBillingEditor({
  order,
  showOngkir,
  onDone,
  onCancel,
}: {
  order: CakeOrder;
  showOngkir: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(order.customer_name);
  const [addOns, setAddOns] = useState<CakeAddOnLine[]>(
    order.add_ons_breakdown && order.add_ons_breakdown.length > 0
      ? order.add_ons_breakdown
      : [{ label: "", price_idr: 0 }]
  );
  const [ongkir, setOngkir] = useState(String(order.delivery_fee_idr || 0));
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Atas nama pemesan wajib");
      return;
    }
    const ongkirNum = parseInt(ongkir, 10);
    startTransition(async () => {
      const res = await updateCakeOrderBilling(order.id, {
        customerName: name.trim(),
        addOns,
        deliveryFeeIdr: showOngkir
          ? Number.isFinite(ongkirNum)
            ? ongkirNum
            : 0
          : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Nama & harga diperbarui");
      onDone();
    });
  };

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm";
  const labelCls =
    "text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border-2 border-foreground bg-card p-3 space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Edit nama &amp; harga
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
          aria-label="Tutup"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Hanya nama pemesan, harga add-ons, dan ongkir yang bisa diubah di
        sini. Spesifikasi kue tetap terkunci.
      </p>

      <label className="block">
        <span className={labelCls}>Nama pemesan</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
          required
        />
      </label>

      <div>
        <span className={labelCls}>Add-ons</span>
        <AddOnsTable rows={addOns} onChange={setAddOns} />
      </div>

      {showOngkir && (
        <label className="block">
          <span className={labelCls}>Ongkir (Rp)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={ongkir}
            onChange={(e) => setOngkir(e.target.value)}
            className={`${inputCls} tabular-nums text-right`}
          />
        </label>
      )}

      <div className="flex gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-primary text-primary-foreground border border-foreground px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
