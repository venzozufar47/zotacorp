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
