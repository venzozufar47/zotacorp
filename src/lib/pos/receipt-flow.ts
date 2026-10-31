/**
 * Perekat struk untuk alur selain keranjang kasir (settle pesanan tertunda dan serah terima custom cake):
 * mengisi bagian tetap struk (header, cabang, alamat, waktu, kasir, footer, WiFi) dari konfigurasi struk outlet,
 * dan mencetak otomatis sesuai setelan perangkat, sama seperti checkout POS biasa. Hanya dipakai di sisi klien.
 */

import { buildReceiptBytes, formatReceiptDateTime, type ReceiptData } from "./receipt";
import { loadReceiptTransport, type ReceiptContent } from "./receipt-settings";
import { sendToPrinter } from "./print-transport";
import { resolveCashierName } from "./cashier-schedule";

export interface ReceiptContext {
  content: ReceiptContent;
  /** Nama cabang rekening (dipakai di struk bila `content.showBranch`). */
  branch: string | null;
  /** Nama kasir login (dipakai bila bukan mode shift). */
  cashierName: string | null;
  /** Kasir shift tetap; null bila tidak memakai sistem shift. */
  fixedCashierName: string | null;
}

/** Bagian tetap struk. Sisanya (item, total, metode) diisi pemanggil. */
export function receiptBaseFields(
  ctx: ReceiptContext,
  now: Date = new Date()
): Pick<ReceiptData, "header" | "branch" | "address" | "datetime" | "cashierName" | "footer" | "wifiName" | "wifiPassword" | "labels"> {
  const rc = ctx.content;
  return {
    header: rc.header,
    branch: rc.showBranch ? rc.branchOverride.trim() || ctx.branch : null,
    address: rc.address,
    datetime: formatReceiptDateTime(now),
    cashierName: ctx.fixedCashierName ?? resolveCashierName(ctx.branch, now, ctx.cashierName),
    footer: rc.footer,
    wifiName: rc.wifiName,
    wifiPassword: rc.wifiPassword,
    labels: rc.labels,
  };
}

/** Cetak otomatis bila diaktifkan di perangkat ini. Best-effort: kegagalan cetak tidak boleh mengganggu alur kasir. */
export function autoPrintReceipt(data: ReceiptData): void {
  const t = loadReceiptTransport();
  if (!t.autoPrint) return;
  void sendToPrinter(buildReceiptBytes(data), t.method).catch(() => {});
}

/**
 * Struk serah terima custom cake: satu baris "Custom Cake" (spesifikasi di baris catatannya), total, lalu baris DP/pelunasan/sisa.
 * Dipakai bersama oleh struk saat serah terima (cetak otomatis) dan cetak ulang dari Riwayat, supaya isinya selalu sama.
 */
export function cakeReceiptData(
  base: ReturnType<typeof receiptBaseFields>,
  a: {
    id: string;
    customerName: string;
    /** Spesifikasi sudah dirangkai (base, bentuk, isian, ukuran). */
    spec: string;
    totalIdr: number;
    /** Yang sudah dibayar sebelum serah terima (DP). */
    paidBeforeIdr: number;
    /** Pelunasan yang diterima saat serah terima. */
    paidNowIdr: number;
    /** Sisa tagihan setelah serah terima. */
    remainingIdr: number;
    /** Metode pelunasan saat serah terima; null bila tidak ada pelunasan. */
    kind: "cash" | "qris" | null;
    cashReceived?: number | null;
    waived?: boolean;
    freeClaim?: boolean;
  }
): ReceiptData {
  const extraLines: { label: string; value: number }[] = [];
  if (a.paidBeforeIdr > 0) extraLines.push({ label: "Sudah dibayar (DP)", value: a.paidBeforeIdr });
  if (a.paidNowIdr > 0) extraLines.push({ label: "Pelunasan", value: a.paidNowIdr });
  if (a.remainingIdr > 0) extraLines.push({ label: "Sisa tagihan", value: a.remainingIdr });
  const kind = a.paidNowIdr > 0 ? a.kind : null;
  return {
    ...base,
    customerName: a.customerName,
    fulfillment: null,
    items: [{ name: "Custom Cake", qty: 1, subtotal: a.totalIdr, note: a.spec.replace(/ · /g, ", ") }],
    grossTotal: a.totalIdr,
    discountAmount: 0,
    total: a.totalIdr,
    method: kind === "cash" ? "cash" : kind === "qris" ? "qris" : "pending",
    cashReceived: kind === "cash" ? (a.cashReceived ?? null) : null,
    change: kind === "cash" && a.cashReceived != null ? a.cashReceived - a.paidNowIdr : null,
    methodText: kind
      ? null
      : a.freeClaim
        ? "Gratis"
        : a.waived
          ? "Dilepas tanpa tagih"
          : a.remainingIdr > 0
            ? "Belum lunas"
            : "Lunas",
    extraLines,
    saleShortId: a.id.slice(0, 8),
  };
}
