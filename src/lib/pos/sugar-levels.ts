/**
 * Tingkat gula untuk minuman POS.
 *
 * Dipisah dari action supaya bisa diimpor client (dialog kasir) maupun
 * server (validasi + struk) — file `"use server"` tidak boleh meng-export
 * non-async.
 *
 * Ini dimensi TERPISAH dari `pos_product_variants`. Varian adalah SKU
 * ber-harga (Regular/Large); gula tidak memengaruhi harga. Menjadikan
 * gula sebagai varian akan melipatgandakan baris katalog (8 minuman × 3
 * gula) sekaligus menduplikasi harga.
 */

export type SugarLevel = "no_sugar" | "less_sugar" | "normal_sugar";

export const SUGAR_LEVELS: SugarLevel[] = [
  "no_sugar",
  "less_sugar",
  "normal_sugar",
];

export const SUGAR_LEVEL_LABELS: Record<SugarLevel, string> = {
  no_sugar: "No Sugar",
  less_sugar: "Less Sugar",
  normal_sugar: "Normal Sugar",
};

export function isSugarLevel(v: unknown): v is SugarLevel {
  return typeof v === "string" && (SUGAR_LEVELS as string[]).includes(v);
}

/** Label siap tampil; null/invalid → null supaya caller bisa skip. */
export function sugarLevelLabel(v: unknown): string | null {
  return isSugarLevel(v) ? SUGAR_LEVEL_LABELS[v] : null;
}

/**
 * Tingkat es (ice) minuman POS. Sama seperti gula: dimensi terpisah dari varian
 * (tak memengaruhi harga). Hanya dua pilihan — tidak ada "no ice".
 */
export type IceLevel = "less_ice" | "normal_ice";

export const ICE_LEVELS: IceLevel[] = ["less_ice", "normal_ice"];

export const ICE_LEVEL_LABELS: Record<IceLevel, string> = {
  less_ice: "Less Ice",
  normal_ice: "Normal Ice",
};

export function isIceLevel(v: unknown): v is IceLevel {
  return typeof v === "string" && (ICE_LEVELS as string[]).includes(v);
}

/** Label siap tampil; null/invalid → null supaya caller bisa skip. */
export function iceLevelLabel(v: unknown): string | null {
  return isIceLevel(v) ? ICE_LEVEL_LABELS[v] : null;
}

/** Label pilihan minuman, urut gula lalu ice (mis. ["Less Sugar", "Normal Ice"]); yang kosong dilewati. */
export function drinkOptionLabels(sugar: unknown, ice: unknown): string[] {
  return [sugarLevelLabel(sugar), iceLevelLabel(ice)].filter((s): s is string => s != null);
}
