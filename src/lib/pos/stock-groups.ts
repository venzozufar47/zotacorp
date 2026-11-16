/**
 * Kelompok hitung stok (kolom `pos_products.stock_group`, migrasi 337). Urutan array = urutan hitung di form
 * opname: sesuai letak barang. Produk tanpa kelompok (null) masuk "Lainnya" di paling akhir. Modul murni.
 */
export const STOCK_GROUPS = [
  { key: "pastry", label: "Pastry-an" },
  { key: "roti", label: "Roti-an" },
  { key: "brownies_dubai", label: "Brownies & Dubai Chewy" },
  { key: "kulkas", label: "Kulkas" },
] as const;

export type StockGroupKey = (typeof STOCK_GROUPS)[number]["key"];

export const STOCK_GROUP_OTHER_LABEL = "Lainnya";

export function isStockGroupKey(v: unknown): v is StockGroupKey {
  return STOCK_GROUPS.some((g) => g.key === v);
}

/** Urutan tampil kelompok (0..n-1); null/tak dikenal → n (paling akhir). */
export function stockGroupRank(key: string | null | undefined): number {
  const i = STOCK_GROUPS.findIndex((g) => g.key === key);
  return i === -1 ? STOCK_GROUPS.length : i;
}

export function stockGroupLabel(key: string | null | undefined): string {
  return STOCK_GROUPS.find((g) => g.key === key)?.label ?? STOCK_GROUP_OTHER_LABEL;
}
