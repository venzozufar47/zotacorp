/**
 * Pemetaan sale POS → byte struk ESC/POS 58mm. Memisahkan "isi struk"
 * dari transport (RawBT) dan dari builder byte mentah (`escpos.ts`).
 *
 * ASCII-only: format Rupiah pakai `id-ID` ("30.000"), pemisah ribuan
 * titik (aman ASCII). Hindari karakter non-ASCII (mis. "×" → "x").
 */

import type { PosSaleSummary } from "@/lib/actions/pos.actions";
import { formatIDR } from "@/lib/cashflow/format";
import { jakartaDateString, jakartaHHMM } from "@/lib/utils/jakarta";
import { EscPosBuilder } from "./escpos";
import { DEFAULT_LABELS, type ReceiptLabels } from "./receipt-settings";

export type ReceiptMethod = "cash" | "qris" | "pending" | "admin";
export type ReceiptFulfillment = "dine_in" | "take_away" | null;

export interface ReceiptItem {
  name: string;
  qty: number;
  subtotal: number;
}

export interface ReceiptData {
  /** Brand di header (editable, mis. "HAENGBOCAKE"). */
  header: string;
  branch: string | null;
  /** Alamat multi-baris (dipisah "\n"). Kosong = tak dicetak. */
  address: string;
  /** Sudah diformat "DD/MM/YYYY HH:mm" WIB. */
  datetime: string;
  cashierName?: string | null;
  customerName?: string | null;
  fulfillment?: ReceiptFulfillment;
  items: ReceiptItem[];
  /** Subtotal sebelum diskon. */
  grossTotal: number;
  discountAmount: number;
  /** Total akhir (= pos_sales.total). */
  total: number;
  method: ReceiptMethod;
  /** Cash tendered — hanya untuk struk transaksi berjalan (tak tersimpan). */
  cashReceived?: number | null;
  change?: number | null;
  footer: string;
  /** Potongan id sale untuk jejak (mis. 8 char pertama). */
  saleShortId?: string | null;
  /** Label/teks tetap. Kosong = pakai default. */
  labels?: ReceiptLabels;
}

/** "DD/MM/YYYY HH:mm" WIB dari sebuah Date. */
export function formatReceiptDateTime(d: Date): string {
  const [y, m, day] = jakartaDateString(d).split("-");
  return `${day}/${m}/${y} ${jakartaHHMM(d)}`;
}

/** "DD/MM/YYYY HH:mm" dari saleDate (YYYY-MM-DD) + saleTime (HH:mm). */
function formatSummaryDateTime(saleDate: string, saleTime: string): string {
  const [y, m, day] = saleDate.split("-");
  const hhmm = (saleTime || "").slice(0, 5);
  return `${day}/${m}/${y} ${hhmm}`;
}

function methodLabel(m: ReceiptMethod, L: ReceiptLabels): string {
  if (m === "cash") return L.methodCash;
  if (m === "qris") return L.methodQris;
  if (m === "admin") return L.methodAdmin;
  return L.methodPending;
}

function fulfillmentLabel(
  f: ReceiptFulfillment,
  L: ReceiptLabels
): string | null {
  if (f === "dine_in") return L.dineIn;
  if (f === "take_away") return L.takeAway;
  return null;
}

/** Susun byte ESC/POS lengkap dari `ReceiptData`. */
export function buildReceiptBytes(data: ReceiptData): Uint8Array {
  const L = data.labels ?? DEFAULT_LABELS;
  const b = new EscPosBuilder();
  b.init();

  // Header brand — besar & center.
  b.align("center").size("double").bold(true).textLine(data.header);
  b.size("normal").bold(false);
  if (data.branch) b.textLine(`${L.branch}: ${data.branch}`);
  if (data.address.trim()) {
    for (const ln of data.address.split("\n")) {
      const t = ln.trim();
      if (t) b.textLine(t);
    }
  }

  b.align("left").line();

  // Meta transaksi.
  b.textLine(data.datetime);
  if (data.cashierName) b.textLine(`${L.cashier}: ${data.cashierName}`);
  const ff = fulfillmentLabel(data.fulfillment ?? null, L);
  if (data.customerName) {
    if (ff) b.row(`${L.customer}: ${data.customerName}`, `(${ff})`);
    else b.textLine(`${L.customer}: ${data.customerName}`);
  } else if (ff) {
    b.textLine(`(${ff})`);
  }

  b.line();

  // Item.
  for (const it of data.items) {
    b.row(`${it.qty}x ${it.name}`, formatIDR(it.subtotal));
  }

  b.line();

  // Total.
  if (data.discountAmount > 0) {
    b.row(L.subtotal, formatIDR(data.grossTotal));
    b.row(L.discount, `-${formatIDR(data.discountAmount)}`);
  }
  b.size("tall").bold(true).row(L.total, formatIDR(data.total));
  b.size("normal").bold(false);

  // Pembayaran.
  b.line();
  if (data.method === "cash" && data.cashReceived != null) {
    b.row(L.cash, formatIDR(data.cashReceived));
    if (data.change != null) b.row(L.change, formatIDR(data.change));
  }
  b.textLine(`${L.method}: ${methodLabel(data.method, L)}`);

  // Footer.
  b.line();
  b.align("center");
  if (data.footer.trim()) {
    for (const ln of data.footer.split("\n")) {
      const t = ln.trim();
      if (t) b.textLine(t);
    }
  }
  if (data.saleShortId) b.textLine(`#${data.saleShortId}`);

  b.feed(4);
  return b.build();
}

export interface ReceiptConfig {
  header: string;
  branch: string | null;
  address: string;
  footer: string;
  labels?: ReceiptLabels;
}

/**
 * Bangun `ReceiptData` dari `PosSaleSummary` untuk CETAK ULANG (Riwayat).
 * Uang tunai & kembalian TIDAK tersedia (tak pernah dipersist), jadi
 * tak ditampilkan. Nama item = "Produk — varian".
 */
export function receiptDataFromSummary(
  s: PosSaleSummary,
  cfg: ReceiptConfig
): ReceiptData {
  const method: ReceiptMethod =
    s.paymentMethod === "admin" ? "admin" : s.paymentMethod;
  return {
    header: cfg.header,
    branch: cfg.branch,
    address: cfg.address,
    datetime: formatSummaryDateTime(s.saleDate, s.saleTime),
    customerName: s.customerName,
    fulfillment: s.fulfillmentType,
    items: s.items.map((it) => ({
      name: it.variantName ? `${it.productName} — ${it.variantName}` : it.productName,
      qty: it.qty,
      subtotal: it.subtotal,
    })),
    grossTotal: s.grossTotal ?? s.total,
    discountAmount: s.discountAmount,
    total: s.total,
    method,
    footer: cfg.footer,
    saleShortId: s.id.slice(0, 8),
    labels: cfg.labels,
  };
}
