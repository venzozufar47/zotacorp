/**
 * Validasi link pembelian bahan (Shopee dsb).
 *
 * Diekstrak dari costing.actions.ts supaya BISA dipakai bersama: link yang
 * sama diedit admin (Master Bahan) maupun staf pengadaan (halaman
 * Pengadaan). Satu kolom (`costing_materials.shopee_url`), satu validator —
 * tidak ada tabel cermin, tidak ada sinkronisasi.
 *
 * File biasa, bukan "use server": modul "use server" melarang export
 * non-async, sehingga fungsi murni ini tak bisa tinggal di sana.
 */

export const LINK_ERROR = "Link harus diawali http:// atau https://";

/**
 * Normalisasi link: kosong → null, `toko.com/x` → diberi `https://`.
 * Hanya http(s) yang diterima — skema lain (mis. `javascript:`) ditolak
 * karena link ini dirender sebagai anchor yang bisa diklik.
 */
export function normalizeLink(
  raw: string | null | undefined
): string | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) ? s : `https://${s}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return "invalid";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "invalid";
  return u.toString();
}
