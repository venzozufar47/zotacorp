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

const METHOD_LABEL: Record<ReceiptMethod, string> = {
  cash: "Cash",
  qris: "QRIS",
  pending: "Belum bayar (Pesanan)",
  admin: "Admin",
};

function fulfillmentLabel(f: ReceiptFulfillment): string | null {
  if (f === "dine_in") return "Dine-in";
  if (f === "take_away") return "Take-away";
  return null;
}

/** Susun byte ESC/POS lengkap dari `ReceiptData`. */
export function buildReceiptBytes(data: ReceiptData): Uint8Array {
  const b = new EscPosBuilder();
  b.init();

  // Header brand — besar & center.
  b.align("center").size("double").bold(true).textLine(data.header);
  b.size("normal").bold(false);
  if (data.branch) b.textLine(`Cabang: ${data.branch}`);
  if (data.address.trim()) {
    for (const ln of data.address.split("\n")) {
      const t = ln.trim();
      if (t) b.textLine(t);
    }
  }

  b.align("left").line();

  // Meta transaksi.
  b.textLine(data.datetime);
  if (data.cashierName) b.textLine(`Kasir: ${data.cashierName}`);
  const ff = fulfillmentLabel(data.fulfillment ?? null);
  if (data.customerName) {
    if (ff) b.row(`Nama: ${data.customerName}`, `(${ff})`);
    else b.textLine(`Nama: ${data.customerName}`);
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
    b.row("Subtotal", formatIDR(data.grossTotal));
    b.row("Diskon", `-${formatIDR(data.discountAmount)}`);
  }
  b.size("tall").bold(true).row("TOTAL", formatIDR(data.total));
  b.size("normal").bold(false);

  // Pembayaran.
  b.line();
  if (data.method === "cash" && data.cashReceived != null) {
    b.row("Tunai", formatIDR(data.cashReceived));
    if (data.change != null) b.row("Kembalian", formatIDR(data.change));
  }
  b.textLine(`Metode: ${METHOD_LABEL[data.method]}`);

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
  };
}
