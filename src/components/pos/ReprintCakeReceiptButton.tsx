"use client";

import { Printer } from "lucide-react";
import { toast } from "sonner";
import type { CakePickupHistoryRow } from "@/lib/actions/pos-cake-pickup.actions";
import { buildReceiptBytes } from "@/lib/pos/receipt";
import { cakeReceiptData, receiptBaseFields, type ReceiptContext } from "@/lib/pos/receipt-flow";
import { loadReceiptTransport } from "@/lib/pos/receipt-settings";
import { sendToPrinter } from "@/lib/pos/print-transport";

/**
 * Cetak ulang struk serah terima custom cake dari Riwayat. Waktu dan nama kasir (jadwal Pare) mengikuti saat kue diambil.
 * Uang tunai dan kembalian tidak tersimpan, jadi tidak dicetak ulang. Metode cetak dibaca dari setelan perangkat saat diklik.
 */
export function ReprintCakeReceiptButton({
  cake,
  receiptCtx,
}: {
  cake: CakePickupHistoryRow;
  receiptCtx: ReceiptContext;
}) {
  async function onPrint() {
    try {
      const at = new Date(cake.pickedUpAt);
      const paidNow = cake.settlement?.amountIdr ?? 0;
      const spec = [cake.spec, cake.dimensionCm ? `${cake.dimensionCm}cm` : ""].filter(Boolean).join(", ");
      const data = cakeReceiptData(receiptBaseFields(receiptCtx, Number.isNaN(at.getTime()) ? new Date() : at), {
        id: cake.id,
        customerName: cake.customerName,
        spec,
        totalIdr: cake.totalIdr,
        // Dibayar sebelum serah terima = total - sisa - pelunasan saat serah terima (gratis: tidak ada DP).
        paidBeforeIdr: cake.freeClaim ? 0 : Math.max(0, cake.totalIdr - cake.remainingIdr - paidNow),
        paidNowIdr: paidNow,
        remainingIdr: cake.remainingIdr,
        kind: cake.settlement?.method ?? null,
        freeClaim: cake.freeClaim,
      });
      await sendToPrinter(buildReceiptBytes(data), loadReceiptTransport().method);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memicu cetak");
    }
  }

  return (
    <button
      type="button"
      onClick={onPrint}
      className="mt-2 w-full h-9 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted inline-flex items-center justify-center gap-1.5"
    >
      <Printer size={13} /> Cetak Struk
    </button>
  );
}
