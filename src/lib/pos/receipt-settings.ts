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
}

export function defaultReceiptSettings(brand: string): ReceiptSettings {
  return {
    header: brand.trim() || "STRUK",
    address: "",
    footer: "Terima kasih!",
    autoPrint: false,
    method: "rawbt",
  };
}

function isPrintMethod(v: unknown): v is PrintMethod {
  return v === "rawbt" || v === "webbluetooth" || v === "native";
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
