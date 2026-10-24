/**
 * Satuan baku bahan. Dipakai UI (dropdown) DAN server (validasi), supaya satuan tak bisa diketik bebas:
 * ejaan beragam ("kotak"/"box", "pack 10", "sak 5kg") membuat konversi dan laporan tak konsisten.
 *
 * - Satuan PAKAI (di resep, stok, opname) hanya satuan dasar: gram, ml, pcs, meter. Satuan lain (kg, liter, lusin…)
 *   boleh dipakai sebagai satuan takaran di resep karena dikonversi lewat costing_units.
 * - Satuan BELI hanyalah label kemasan; ukurannya ada di "isi per satuan beli", bukan di nama satuan.
 *
 * Nilai lama yang tak ada di daftar tetap boleh dipertahankan (data lama), tetapi tidak bisa dipilih untuk bahan lain.
 */

export const USAGE_UNITS = ["gram", "ml", "pcs", "meter"] as const;

export const PURCHASE_UNITS = [
  "pcs",
  "pack",
  "bungkus",
  "sachet",
  "renceng",
  "sak",
  "kg",
  "liter",
  "botol",
  "galon",
  "jerigen",
  "kaleng",
  "box",
  "dus",
  "karton",
  "roll",
  "ikat",
  "tray",
  "lusin",
] as const;

export const isUsageUnit = (v: string): boolean => (USAGE_UNITS as readonly string[]).includes(v.trim().toLowerCase());
export const isPurchaseUnit = (v: string): boolean => (PURCHASE_UNITS as readonly string[]).includes(v.trim().toLowerCase());

export interface UnitOption {
  value: string;
  label: string;
}

/** Daftar pilihan + nilai lama bahan ini bila tak baku (ditandai "(lama)" supaya jelas perlu diganti). */
export function unitOptions(standard: readonly string[], current?: string | null): UnitOption[] {
  const opts: UnitOption[] = standard.map((u) => ({ value: u, label: u }));
  const cur = current?.trim();
  if (cur && !standard.includes(cur.toLowerCase())) opts.push({ value: cur, label: `${cur} (lama)` });
  return opts;
}
