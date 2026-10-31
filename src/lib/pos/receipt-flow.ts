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
