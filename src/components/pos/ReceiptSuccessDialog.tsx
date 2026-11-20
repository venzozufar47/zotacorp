"use client";

import { useState } from "react";
import { Printer, X, Check, GlassWater } from "lucide-react";
import { toast } from "sonner";
import { formatRp } from "@/lib/cashflow/format";
import { buildDrinkCheckerBytes, drinkCups } from "@/lib/pos/drink-checker";
import { buildReceiptBytes, type ReceiptData } from "@/lib/pos/receipt";
import { loadReceiptTransport } from "@/lib/pos/receipt-settings";
import { sendToPrinter } from "@/lib/pos/print-transport";

/**
 * Layar sukses singkat setelah sale dibuat. Menampung tombol Cetak Struk
 * (manual). Auto-cetak (jika diaktifkan) ditangani di POSClient sebelum
 * dialog ini muncul — di sini murni afordance manual + tutup.
 */
export function ReceiptSuccessDialog({
  data,
  onClose,
}: {
  data: ReceiptData;
  onClose: () => void;
}) {
  const cups = drinkCups(data).length;
  const [checkerPrinted, setCheckerPrinted] = useState(false);
  // Nota berisi minuman: dialog tak bisa ditutup sebelum checker dicetak manual
  // (struk utama harus disobek dulu dari printer, jadi tak bisa otomatis).
  const locked = cups > 0 && !checkerPrinted;
  const close = () => {
    if (!locked) onClose();
  };

  async function onPrint() {
    try {
      const { method } = loadReceiptTransport();
      await sendToPrinter(buildReceiptBytes(data), method);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memicu cetak");
    }
  }

  async function onPrintChecker() {
    try {
      const { method } = loadReceiptTransport();
      await sendToPrinter(buildDrinkCheckerBytes(data), method);
      setCheckerPrinted(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memicu cetak");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card border-2 border-foreground shadow-[4px_4px_0_0_var(--foreground)] p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center size-9 rounded-full bg-success/20 text-success">
              <Check size={18} />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Tersimpan
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-foreground leading-none">
                {formatRp(data.total)}
              </h2>
            </div>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={onClose}
              className="size-8 inline-flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          {data.customerName ? (
            <span className="text-foreground font-medium">{data.customerName}</span>
          ) : null}
          {data.customerName ? " · " : ""}
          {data.items.reduce((n, it) => n + it.qty, 0)} item
        </div>

        <button
          type="button"
          onClick={onPrint}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90"
        >
          <Printer size={18} /> Cetak Struk
        </button>

        {cups > 0 && (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onPrintChecker}
              className={
                checkerPrinted
                  ? "w-full h-10 rounded-xl border-2 border-success/40 text-success text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-muted"
                  : "w-full h-12 rounded-xl bg-accent text-accent-foreground font-semibold inline-flex items-center justify-center gap-2 hover:opacity-90"
              }
            >
              {checkerPrinted ? (
                <>
                  <Check size={16} /> Checker tercetak · Cetak ulang
                </>
              ) : (
                <>
                  <GlassWater size={18} /> Cetak Checker Minuman ({cups})
                </>
              )}
            </button>
            {!checkerPrinted && (
              <p className="text-xs text-muted-foreground text-center">
                Sobek struk dari printer dulu, lalu cetak checker.
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={close}
          disabled={locked}
          className="w-full h-10 rounded-xl border-2 border-border text-sm font-medium hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
        >
          Selesai
        </button>
      </div>
    </div>
  );
}
