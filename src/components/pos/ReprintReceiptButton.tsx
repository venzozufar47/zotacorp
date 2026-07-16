"use client";

import { Printer } from "lucide-react";
import { toast } from "sonner";
import type { PosSaleSummary } from "@/lib/actions/pos.actions";
import { buildReceiptBytes, receiptDataFromSummary } from "@/lib/pos/receipt";
import {
  loadReceiptTransport,
  type ReceiptContent,
} from "@/lib/pos/receipt-settings";
import { sendToPrinter } from "@/lib/pos/print-transport";
import { resolveCashierName } from "@/lib/pos/cashier-schedule";

/**
 * Tombol cetak ulang struk dari Riwayat. Konten struk (`content`) berasal
 * dari server (sama lintas perangkat); metode cetak dibaca device-local
 * saat diklik. Uang tunai & kembalian tak tersedia untuk sale lama → tidak
 * dicetak.
 */
export function ReprintReceiptButton({
  sale,
  content,
  branch,
}: {
  sale: PosSaleSummary;
  content: ReceiptContent;
  branch: string | null;
}) {
  async function onPrint() {
    try {
      const effBranch = content.showBranch
        ? content.branchOverride.trim() || branch
        : null;
      const data = receiptDataFromSummary(sale, {
        header: content.header,
        branch: effBranch,
        address: content.address,
        footer: content.footer,
        wifiName: content.wifiName,
        wifiPassword: content.wifiPassword,
        labels: content.labels,
      });
      // Nama kasir Pare mengikuti jadwal shift pada waktu sale itu.
      const saleAt = new Date(
        `${sale.saleDate}T${(sale.saleTime || "00:00").slice(0, 5)}:00+07:00`
      );
      data.cashierName = resolveCashierName(branch, saleAt, null);
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
