"use client";

import { Printer } from "lucide-react";
import { toast } from "sonner";
import type { PosSaleSummary } from "@/lib/actions/pos.actions";
import { buildReceiptBytes, receiptDataFromSummary } from "@/lib/pos/receipt";
import { loadReceiptSettings } from "@/lib/pos/receipt-settings";
import { sendToPrinter } from "@/lib/pos/print-transport";

/**
 * Tombol cetak ulang struk dari Riwayat. Membaca setelan struk
 * device-local saat diklik (localStorage tak terbaca di server
 * component), lalu susun byte dari `PosSaleSummary`. Uang tunai &
 * kembalian tak tersedia untuk sale lama → tidak dicetak.
 */
export function ReprintReceiptButton({
  sale,
  brand,
  branch,
}: {
  sale: PosSaleSummary;
  brand: string;
  branch: string | null;
}) {
  async function onPrint() {
    try {
      const rc = loadReceiptSettings(brand);
      const data = receiptDataFromSummary(sale, {
        header: rc.header,
        branch,
        address: rc.address,
        footer: rc.footer,
      });
      await sendToPrinter(buildReceiptBytes(data), rc.method);
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
