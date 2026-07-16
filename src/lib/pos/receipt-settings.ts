/**
 * Setelan struk POS terbagi dua:
 *
 *  1. KONTEN (ReceiptContent) — header, alamat, footer, cabang, label.
 *     Disimpan di SERVER per rekening POS (bank_accounts.pos_receipt_config)
 *     supaya SAMA di semua perangkat kasir. Lihat pos-receipt-config.actions.
 *
 *  2. TRANSPORT (ReceiptTransport) — metode cetak + auto-cetak. Tetap
 *     device-local (localStorage) karena tiap HP punya printer/koneksi
 *     sendiri. Pola mirror `PayslipViewPersist.tsx`.
 *
 * Modul ini murni util (tanpa "use client") supaya tipe & default konten
 * bisa diimpor server component; fungsi localStorage dijaga `typeof window`.
 */

const KEY = "zota:pos:receiptTransport:v1";

/** Jalur pengiriman byte struk ke printer.
 *  - rawbt: via app RawBT (Android intent) — Bluetooth Classic + LE.
 *  - webbluetooth: langsung dari Chrome tanpa app — HANYA printer BLE.
 *  - native: plugin Capacitor di app native (belum dirilis). */
export type PrintMethod = "rawbt" | "webbluetooth" | "native";

/** Semua label/teks tetap pada struk — bisa diganti kata-katanya. */
export interface ReceiptLabels {
  branch: string; // prefiks cabang, mis. "Cabang"
  cashier: string; // "Kasir"
  customer: string; // "Nama"
  dineIn: string; // "Dine-in"
  takeAway: string; // "Take-away"
  subtotal: string; // "Subtotal"
  discount: string; // "Diskon"
  total: string; // "TOTAL"
  cash: string; // "Tunai"
  change: string; // "Kembalian"
  method: string; // prefiks metode, "Metode"
  methodCash: string; // "Cash"
  methodQris: string; // "QRIS"
  methodPending: string; // "Belum bayar"
  methodAdmin: string; // "Admin"
}

export const DEFAULT_LABELS: ReceiptLabels = {
  branch: "Cabang",
  cashier: "Kasir",
  customer: "Nama",
  dineIn: "Dine-in",
  takeAway: "Take-away",
  subtotal: "Subtotal",
  discount: "Diskon",
  total: "TOTAL",
  cash: "Tunai",
  change: "Kembalian",
  method: "Metode",
  methodCash: "Cash",
  methodQris: "QRIS",
  methodPending: "Belum bayar",
  methodAdmin: "Admin",
};

// ── Konten bersama (server) ──────────────────────────────────────────
export interface ReceiptContent {
  /** Brand di header struk. */
  header: string;
  /** Alamat multi-baris (dipisah "\n"). */
  address: string;
  /** Teks penutup (mis. "Terima kasih!"). */
  footer: string;
  /** Tampilkan baris cabang di struk. */
  showBranch: boolean;
  /** Override teks cabang (kosong = pakai cabang rekening). */
  branchOverride: string;
  /** Label/teks tetap yang bisa diedit. */
  labels: ReceiptLabels;
}

export function defaultReceiptContent(brand: string): ReceiptContent {
  return {
    header: brand.trim() || "STRUK",
    address: "",
    footer: "Terima kasih!",
    showBranch: true,
    branchOverride: "",
    labels: { ...DEFAULT_LABELS },
  };
}

/** Merge label tersimpan dengan default per-field (guard string). */
function mergeLabels(saved: unknown): ReceiptLabels {
  const out = { ...DEFAULT_LABELS };
  if (saved && typeof saved === "object") {
    for (const k of Object.keys(DEFAULT_LABELS) as Array<keyof ReceiptLabels>) {
      const v = (saved as Record<string, unknown>)[k];
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

/**
 * Normalisasi jsonb tersimpan (bisa null / bentuk lama) → ReceiptContent
 * lengkap dengan default turunan `brand`. Dipakai server saat membaca
 * `bank_accounts.pos_receipt_config`.
 */
export function normalizeReceiptContent(
  raw: unknown,
  brand: string
): ReceiptContent {
  const base = defaultReceiptContent(brand);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  return {
    header: typeof r.header === "string" ? r.header : base.header,
    address: typeof r.address === "string" ? r.address : base.address,
    footer: typeof r.footer === "string" ? r.footer : base.footer,
    showBranch: typeof r.showBranch === "boolean" ? r.showBranch : base.showBranch,
    branchOverride:
      typeof r.branchOverride === "string" ? r.branchOverride : base.branchOverride,
    labels: mergeLabels(r.labels),
  };
}

// ── Transport (device-local) ─────────────────────────────────────────
export interface ReceiptTransport {
  method: PrintMethod;
  autoPrint: boolean;
}

export function defaultReceiptTransport(): ReceiptTransport {
  return { method: "rawbt", autoPrint: false };
}

function isPrintMethod(v: unknown): v is PrintMethod {
  return v === "rawbt" || v === "webbluetooth" || v === "native";
}

export function loadReceiptTransport(): ReceiptTransport {
  const base = defaultReceiptTransport();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<ReceiptTransport>;
    return {
      method: isPrintMethod(saved.method) ? saved.method : base.method,
      autoPrint:
        typeof saved.autoPrint === "boolean" ? saved.autoPrint : base.autoPrint,
    };
  } catch {
    return base;
  }
}

export function saveReceiptTransport(t: ReceiptTransport): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // storage penuh / dinonaktifkan — abaikan.
  }
}
