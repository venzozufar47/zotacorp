"use client";

/**
 * Setelan struk POS — device-local (localStorage). Sengaja per-perangkat
 * karena printer fisik terikat ke HP kasir tertentu; header/alamat/footer
 * & preferensi auto-cetak wajar berbeda antar outlet/HP. Pola mirror
 * `src/components/admin/PayslipViewPersist.tsx`.
 */

const KEY = "zota:pos:receiptSettings:v1";

export interface ReceiptSettings {
  /** Brand di header struk. */
  header: string;
  /** Alamat multi-baris (dipisah "\n"). */
  address: string;
  /** Teks penutup (mis. "Terima kasih!"). */
  footer: string;
  /** Auto-cetak begitu sale lunas (cash/qris) tanpa menekan tombol. */
  autoPrint: boolean;
}

export function defaultReceiptSettings(brand: string): ReceiptSettings {
  return {
    header: brand.trim() || "STRUK",
    address: "",
    footer: "Terima kasih!",
    autoPrint: false,
  };
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
