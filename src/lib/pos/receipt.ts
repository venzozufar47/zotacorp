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
import { COLS, EscPosBuilder } from "./escpos";
import { DEFAULT_LABELS, type ReceiptLabels } from "./receipt-settings";
import { sugarLevelLabel } from "./sugar-levels";

/**
 * Pecah teks menjadi baris ≤ COLS karakter, memutus di batas KATA (bukan
 * di tengah kata). Menghormati newline eksplisit dari user. Kata yang
 * lebih panjang dari COLS dipotong keras sebagai fallback.
 */
function wrapText(s: string): string[] {
  const out: string[] = [];
  for (const rawLine of s.split("\n")) {
    let line = "";
    for (const word of rawLine.trim().split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > COLS) {
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, COLS));
        w = w.slice(COLS);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= COLS) line += " " + w;
      else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

export type ReceiptMethod = "cash" | "qris" | "pending" | "admin";
export type ReceiptFulfillment = "dine_in" | "take_away" | null;

export interface ReceiptItem {
  name: string;
  qty: number;
  subtotal: number;
  /** Modifier per item (mis. tingkat gula). Dicetak di baris SENDIRI
   *  di bawah nama, karena `row()` memotong teks kiri yang melebihi
   *  lebar kertas — kalau digabung ke nama, "Less Sugar" bisa terpotong
   *  jadi "Less" dan struk kehilangan gunanya sebagai acuan barista. */
  note?: string | null;
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
  /** Nama/SSID WiFi (opsional). */
  wifiName?: string;
  /** Password WiFi (opsional). */
  wifiPassword?: string;
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

/**
 * "DD/MM/YYYY HH:mm" untuk sale historis. `saleTime` adalah timestamp ISO
 * penuh (mis. "2026-07-16T12:00:00+00:00") — di-parse & diformat ke WIB.
 * Bila kosong/tak valid, jatuh ke tanggal saja.
 */
function formatSummaryDateTime(saleDate: string, saleTime: string): string {
  if (saleTime) {
    const d = new Date(saleTime);
    if (!Number.isNaN(d.getTime())) return formatReceiptDateTime(d);
  }
  const [y, m, day] = saleDate.split("-");
  return `${day}/${m}/${y}`;
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
  if (data.branch) {
    for (const l of wrapText(`${L.branch}: ${data.branch}`)) b.textLine(l);
  }
  if (data.address.trim()) {
    for (const l of wrapText(data.address)) b.textLine(l);
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
    // Modifier di baris terpisah + indent supaya jelas menempel ke item
    // di atasnya dan tidak kena truncation kolom harga.
    if (it.note) {
      // Label gula pendek (maks "Normal Sugar"), tapi tetap dibatasi ke
      // lebar kertas supaya aman kalau `note` dipakai teks lain nanti.
      b.textLine(`  * ${it.note}`.slice(0, COLS));
    }
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

  // WiFi (opsional) — di area bawah, center. Nama & password baris sendiri.
  b.line();
  b.align("center");
  const wifiName = (data.wifiName ?? "").trim();
  const wifiPass = (data.wifiPassword ?? "").trim();
  if (wifiName) for (const l of wrapText(`${L.wifi}: ${wifiName}`)) b.textLine(l);
  if (wifiPass) {
    for (const l of wrapText(`${L.wifiPassword}: ${wifiPass}`)) b.textLine(l);
  }

  // Footer — word-wrap supaya tak terpotong di tengah kata.
  if (data.footer.trim()) {
    for (const l of wrapText(data.footer)) b.textLine(l);
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
  wifiName?: string;
  wifiPassword?: string;
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
      name: it.variantName
        ? `${it.productName} — ${it.variantName}`
        : it.productName,
      qty: it.qty,
      subtotal: it.subtotal,
      note: sugarLevelLabel(it.sugarLevel),
    })),
    grossTotal: s.grossTotal ?? s.total,
    discountAmount: s.discountAmount,
    total: s.total,
    method,
    footer: cfg.footer,
    wifiName: cfg.wifiName,
    wifiPassword: cfg.wifiPassword,
    saleShortId: s.id.slice(0, 8),
    labels: cfg.labels,
  };
}
