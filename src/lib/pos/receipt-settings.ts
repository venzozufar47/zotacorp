"use client";

/**
 * Setelan struk POS — device-local (localStorage). Sengaja per-perangkat
 * karena printer fisik terikat ke HP kasir tertentu; header/alamat/footer
 * & preferensi auto-cetak wajar berbeda antar outlet/HP. Pola mirror
 * `src/components/admin/PayslipViewPersist.tsx`.
 */

const KEY = "zota:pos:receiptSettings:v1";

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

export interface ReceiptSettings {
  /** Brand di header struk. */
  header: string;
  /** Alamat multi-baris (dipisah "\n"). */
  address: string;
  /** Teks penutup (mis. "Terima kasih!"). */
  footer: string;
  /** Auto-cetak begitu sale lunas (cash/qris) tanpa menekan tombol. */
  autoPrint: boolean;
  /** Metode kirim ke printer. */
  method: PrintMethod;
  /** Tampilkan baris cabang di struk. */
  showBranch: boolean;
  /** Override teks cabang (kosong = pakai cabang rekening). */
  branchOverride: string;
  /** Label/teks tetap yang bisa diedit. */
  labels: ReceiptLabels;
}

export function defaultReceiptSettings(brand: string): ReceiptSettings {
  return {
    header: brand.trim() || "STRUK",
    address: "",
    footer: "Terima kasih!",
    autoPrint: false,
    method: "rawbt",
    showBranch: true,
    branchOverride: "",
    labels: { ...DEFAULT_LABELS },
  };
}

function isPrintMethod(v: unknown): v is PrintMethod {
  return v === "rawbt" || v === "webbluetooth" || v === "native";
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
 * Muat setelan tersimpan, di-merge dengan default (turunan `brand`).
 * `brand` dipakai hanya untuk mengisi header default bila belum ada
 * nilai tersimpan. Aman dipanggil di server (mengembalikan default).
 */
export function loadReceiptSettings(brand: string): ReceiptSettings {
  const base = defaultReceiptSettings(brand);
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<ReceiptSettings>;
    return {
      header: typeof saved.header === "string" ? saved.header : base.header,
      address: typeof saved.address === "string" ? saved.address : base.address,
      footer: typeof saved.footer === "string" ? saved.footer : base.footer,
      autoPrint: typeof saved.autoPrint === "boolean" ? saved.autoPrint : base.autoPrint,
      method: isPrintMethod(saved.method) ? saved.method : base.method,
      showBranch:
        typeof saved.showBranch === "boolean" ? saved.showBranch : base.showBranch,
      branchOverride:
        typeof saved.branchOverride === "string"
          ? saved.branchOverride
          : base.branchOverride,
      labels: mergeLabels(saved.labels),
    };
  } catch {
    return base;
  }
}

export function saveReceiptSettings(s: ReceiptSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage penuh / dinonaktifkan — abaikan.
  }
}
