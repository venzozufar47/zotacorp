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
 * Pemetaan brand costing virtual (per-cabang, lihat header di atas) →
 * `bank_accounts` POS yang sebenarnya. `bank_accounts.business_unit`
 * TETAP "Haengbocake" (induk) untuk kedua cabang — hanya `default_branch`
 * yang membedakannya. Tanpa pemetaan ini, kode yang mencocokkan brand
 * costing langsung ke `bank_accounts.business_unit` (mis. picker
 * "Tautkan ke POS") akan selalu 0 hasil untuk Haengbocake Pare/Semarang,
 * karena stringnya memang tidak pernah sama persis.
 *
 * Brand lain (tanpa split, mis. "Yeobo Space") lolos apa adanya —
 * `bank_accounts.business_unit`-nya sudah sama persis dengan nama brand
 * costing.
 */
const COSTING_BRAND_POS_BRANCH: Readonly<Record<string, string>> = {
  "Haengbocake Pare": "Pare",
  "Haengbocake Semarang": "Semarang",
};

/** Filter `bank_accounts` yang berlaku untuk sebuah brand costing. */
export function posAccountFilterForCostingBrand(costingBrand: string): {
  businessUnit: string;
  branch?: string;
} {
  const branch = COSTING_BRAND_POS_BRANCH[costingBrand];
  return branch ? { businessUnit: "Haengbocake", branch } : { businessUnit: costingBrand };
}

/**
 * Kebalikannya: brand costing yang berlaku untuk sebuah rekening POS
 * (`business_unit` + `default_branch`-nya). Dipakai `setPosLink` supaya
 * perbandingan brand-nya di namespace yang SAMA dengan
 * `costing_products.business_unit` (bukan `bank_accounts.business_unit`
 * mentah, yang untuk Haengbocake selalu "Haengbocake" tanpa cabang).
 */
export function costingBrandForPosAccount(
  businessUnit: string,
  branch: string | null
): string {
  if (businessUnit === "Haengbocake" && branch) {
    for (const [costingBrand, b] of Object.entries(COSTING_BRAND_POS_BRANCH)) {
      if (b === branch) return costingBrand;
    }
  }
  return businessUnit;
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
