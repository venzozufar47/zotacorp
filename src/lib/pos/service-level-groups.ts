/**
 * Unit hitung Service Level: SKU yang saling menggantikan dihitung SEBAGAI SATU produk. Varian produk-produk di
 * `SL_SUBSTITUTE_PRODUCTS` (mis. Dubai Chewy Cookies Grade A dan Grade B) digabung: unit itu dianggap ready bila SALAH SATU
 * variannya ready, dan hanya dihitung satu kali di pembilang maupun penyebut. Hanya berlaku untuk metrik Service Level;
 * stok, penjualan, dan opname di POS tetap per varian. Modul murni.
 */

/** Nama produk (tanpa membedakan huruf besar/kecil) yang semua variannya saling menggantikan. */
export const SL_SUBSTITUTE_PRODUCTS: readonly string[] = ["Dubai Chewy Cookies"];

export interface SlSkuInfo {
  key: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
}

export interface SlUnit {
  /** Kunci SKU anggota (satu untuk SKU biasa; beberapa untuk kelompok pengganti). */
  members: string[];
  label: string;
  /** SKU pertama anggota, dipakai sebagai identitas unit di daftar penyebab. */
  productId: string;
  variantId: string | null;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Susun unit dari daftar SKU. Varian produk pengganti digabung per produk (hanya bila ada ≥ 2 varian); sisanya satu SKU
 * satu unit. Urutan unit mengikuti kemunculan pertama anggotanya.
 */
export function buildServiceLevelUnits(skus: readonly SlSkuInfo[], substituteProducts: readonly string[] = SL_SUBSTITUTE_PRODUCTS): SlUnit[] {
  const subs = new Set(substituteProducts.map(norm));
  const groupByProduct = new Map<string, SlSkuInfo[]>();
  for (const s of skus) {
    if (s.variantId !== null && subs.has(norm(s.productName))) {
      const arr = groupByProduct.get(s.productId) ?? [];
      arr.push(s);
      groupByProduct.set(s.productId, arr);
    }
  }
  const units: SlUnit[] = [];
  const emitted = new Set<string>();
  for (const s of skus) {
    const group = groupByProduct.get(s.productId);
    if (group && group.length >= 2) {
      if (emitted.has(s.productId)) continue;
      emitted.add(s.productId);
      const names = group.map((g) => g.variantName).filter((v): v is string => !!v);
      units.push({
        members: group.map((g) => g.key),
        label: names.length > 0 ? `${s.productName} (${names.join(" / ")})` : s.productName,
        productId: group[0].productId,
        variantId: group[0].variantId,
      });
      continue;
    }
    units.push({
      members: [s.key],
      label: s.productName + (s.variantName ? ` — ${s.variantName}` : ""),
      productId: s.productId,
      variantId: s.variantId,
    });
  }
  return units;
}
