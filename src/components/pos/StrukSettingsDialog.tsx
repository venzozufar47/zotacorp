"use client";

import { useMemo, useState } from "react";
import { X, Printer, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  loadReceiptSettings,
  saveReceiptSettings,
  type ReceiptSettings,
} from "@/lib/pos/receipt-settings";
import { buildReceiptBytes, formatReceiptDateTime, type ReceiptData } from "@/lib/pos/receipt";
import { escPosToPreviewText } from "@/lib/pos/escpos";
import { printReceipt } from "@/lib/pos/rawbt";

/**
 * Setelan struk per-perangkat: header/alamat/footer + toggle auto-cetak.
 * Menyediakan Pratinjau (render teks tanpa printer) & Tes cetak (kirim
 * struk contoh ke RawBT). Simpan ke localStorage.
 */
export function StrukSettingsDialog({
  brand,
  branch,
  now,
  onClose,
}: {
  /** Default header (nama outlet). */
  brand: string;
  branch: string | null;
  /** Waktu untuk contoh struk (dilewatkan supaya komponen tetap murni). */
  now: Date;
  onClose: () => void;
}) {
  const initial = useMemo(() => loadReceiptSettings(brand), [brand]);
  const [s, setS] = useState<ReceiptSettings>(initial);
  const [preview, setPreview] = useState<string | null>(null);

  function sampleData(): ReceiptData {
    return {
      header: s.header,
      branch,
      address: s.address,
      datetime: formatReceiptDateTime(now),
      cashierName: null,
      customerName: "Contoh",
      fulfillment: "dine_in",
      items: [
        { name: "Matcha Latte", qty: 2, subtotal: 30000 },
        { name: "Croissant", qty: 1, subtotal: 18000 },
      ],
      grossTotal: 48000,
      discountAmount: 3000,
      total: 45000,
      method: "cash",
      cashReceived: 50000,
      change: 5000,
      footer: s.footer,
      saleShortId: "contoh12",
    };
  }

  function onPreview() {
    setPreview(escPosToPreviewText(buildReceiptBytes(sampleData())));
  }

  function onTestPrint() {
    try {
      printReceipt(buildReceiptBytes(sampleData()));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memicu cetak");
    }
  }

  function onSave() {
    saveReceiptSettings(s);
    toast.success("Setelan struk disimpan");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)] p-4 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Setelan struk
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-foreground">Printer 58mm</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-foreground">Header (brand)</span>
          <input
            className="mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
            value={s.header}
            onChange={(e) => setS({ ...s, header: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-foreground">Alamat (opsional, bisa multi-baris)</span>
          <textarea
            className="mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
            rows={2}
            value={s.address}
            onChange={(e) => setS({ ...s, address: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-foreground">Footer</span>
          <input
            className="mt-1 w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-sm"
            value={s.footer}
            onChange={(e) => setS({ ...s, footer: e.target.value })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
          <span className="text-sm">
            <span className="font-medium text-foreground">Auto-cetak</span>
            <span className="block text-[11px] text-muted-foreground">
              Cetak otomatis tiap sale lunas (cash/QRIS).
            </span>
          </span>
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={s.autoPrint}
            onChange={(e) => setS({ ...s, autoPrint: e.target.checked })}
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPreview}
            className="flex-1 h-10 rounded-xl border-2 border-border text-sm font-medium hover:bg-muted inline-flex items-center justify-center gap-1.5"
          >
            <Eye size={15} /> Pratinjau
          </button>
          <button
            type="button"
            onClick={onTestPrint}
            className="flex-1 h-10 rounded-xl border-2 border-border text-sm font-medium hover:bg-muted inline-flex items-center justify-center gap-1.5"
          >
            <Printer size={15} /> Tes cetak
          </button>
        </div>

        {preview && (
          <pre className="rounded-xl border border-border bg-muted/40 p-3 text-[11px] leading-tight font-mono whitespace-pre overflow-x-auto">
            {preview}
          </pre>
        )}

        <button
          type="button"
          onClick={onSave}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90"
        >
          Simpan
        </button>
      </div>
    </div>
  );
}
