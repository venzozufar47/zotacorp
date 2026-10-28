/**
 * HPP Custom Cake untuk Scorecard Unit. Tiap pesanan dipetakan lewat (kue dasar × diameter) ke resep costing; pesanan
 * tanpa peta/resep dianggap belum punya HPP dan dilaporkan sebagai kekurangan. Murni (tanpa import) agar bisa diuji.
 */

export interface CakeOrderNet {
  baseOptionId: string | null;
  diameterCm: number | null;
  /** total − ongkir − refund (rupiah). */
  net: number;
}

export interface CakeHppResult {
  /** Biaya bahan semua pesanan yang punya resep. */
  hppCost: number;
  coveredNet: number;
  uncoveredNet: number;
  /** Kombinasi tanpa resep, terbesar dulu — "kekurangan" yang bisa dilengkapi. */
  missing: { key: string; label: string; diameterCm: number | null; orders: number; net: number }[];
}

/** key peta = `${optionId}|${diameterCm}` → nama resep; hppByName = nama resep (huruf kecil) → biaya bahan per unit. */
export function cakeHpp(
  orders: CakeOrderNet[],
  cakeMap: Map<string, string>,
  hppByName: Map<string, number>,
  optionLabel: (id: string | null) => string
): CakeHppResult {
  let hppCost = 0;
  let coveredNet = 0;
  let uncoveredNet = 0;
  const miss = new Map<string, { label: string; diameterCm: number | null; orders: number; net: number }>();
  for (const o of orders) {
    const name = o.baseOptionId && o.diameterCm ? cakeMap.get(`${o.baseOptionId}|${Math.round(o.diameterCm)}`) : undefined;
    const h = name ? hppByName.get(name.trim().toLowerCase()) : undefined;
    if (h == null) {
      uncoveredNet += o.net;
      const key = `${o.baseOptionId ?? "-"}|${o.diameterCm == null ? "-" : Math.round(o.diameterCm)}`;
      const cur = miss.get(key) ?? { label: optionLabel(o.baseOptionId), diameterCm: o.diameterCm == null ? null : Math.round(o.diameterCm), orders: 0, net: 0 };
      cur.orders += 1;
      cur.net += o.net;
      miss.set(key, cur);
    } else {
      hppCost += h;
      coveredNet += o.net;
    }
  }
  return {
    hppCost,
    coveredNet,
    uncoveredNet,
    missing: [...miss].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.net - a.net),
  };
}
