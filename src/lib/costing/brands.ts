/**
 * Brand (business unit) yang tampil di modul costing/HPP.
 *
 * `Haengbocake` adalah SATU business unit dengan dua cabang
 * (Haengbocake Pare & Haengbocake Semarang). Rekening kas tetap gabung
 * di bawah nama induk "Haengbocake", tapi HPP dihitung terpisah per
 * cabang. Jadi induknya disembunyikan dari picker costing — master bahan
 * & resep hanya dikelola di level cabang. Pengecualian lain (kalau nanti
 * ada BU induk lain yang dipecah) cukup ditambahkan ke set ini.
 */
const COSTING_HIDDEN_BRANDS = new Set<string>(["Haengbocake"]);

/** Saring daftar nama BU → hanya brand yang relevan untuk costing. */
export function costingBrands(names: string[]): string[] {
  return names.filter((n) => !COSTING_HIDDEN_BRANDS.has(n));
}

/**
 * Cookie brand terakhir dibuka. Ditulis client (`rememberBrand`) saat
 * user ganti brand, dibaca server saat halaman costing dirender tanpa
 * `?bu=`. Pola sama dengan preferensi bahasa (src/lib/i18n/server.ts):
 * cookie — bukan localStorage — supaya server bisa langsung merender
 * brand yang benar tanpa flash/redirect di klien.
 */
export const COSTING_BRAND_COOKIE = "zota_costing_bu";

/**
 * Brand aktif: `?bu=` menang (link/bookmark eksplisit), lalu brand
 * terakhir dibuka, lalu brand pertama. Selalu divalidasi terhadap daftar
 * brand yang ada — cookie basi (BU dihapus/di-rename) diabaikan.
 */
export function pickActiveBrand(
  brands: string[],
  bu?: string | null,
  lastOpened?: string | null
): string | undefined {
  if (bu && brands.includes(bu)) return bu;
  if (lastOpened && brands.includes(lastOpened)) return lastOpened;
  return brands[0];
}

/** Simpan brand terakhir dibuka (client-side). No-op di server. */
export function rememberBrand(bu: string) {
  if (typeof document === "undefined") return;
  // 1 tahun; path=/ supaya berlaku di semua halaman costing.
  document.cookie = `${COSTING_BRAND_COOKIE}=${encodeURIComponent(
    bu
  )}; path=/; max-age=31536000; samesite=lax`;
}
