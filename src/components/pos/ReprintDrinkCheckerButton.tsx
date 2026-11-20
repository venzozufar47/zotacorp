"use client";

import { GlassWater } from "lucide-react";
import { toast } from "sonner";
import type { PosSaleSummary } from "@/lib/actions/pos.actions";
import { buildDrinkCheckerBytes, drinkCups } from "@/lib/pos/drink-checker";
import { receiptDataFromSummary } from "@/lib/pos/receipt";
import {
  loadReceiptTransport,
  type ReceiptContent,
} from "@/lib/pos/receipt-settings";
import { sendToPrinter } from "@/lib/pos/print-transport";

/** Cetak ulang checker minuman dari Riwayat. Tak tampil bila nota tanpa minuman bergula. */
export function ReprintDrinkCheckerButton({
  sale,
  content,
}: {
  sale: PosSaleSummary;
  content: ReceiptContent;
}) {
  const data = receiptDataFromSummary(sale, {
    header: content.header,
    branch: null,
    address: "",
    footer: "",
    labels: content.labels,
  });
  const cups = drinkCups(data).length;
  if (cups === 0) return null;

  async function onPrint() {
    try {
      await sendToPrinter(buildDrinkCheckerBytes(data), loadReceiptTransport().method);
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
      <GlassWater size={13} /> Cetak Checker Minuman ({cups})
    </button>
  );
}
