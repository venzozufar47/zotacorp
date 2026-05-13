/**
 * Base-cake price resolution. Single source of truth dipakai oleh
 * form (client-side preview) dan server action saat insert/update.
 *
 * Aturan:
 *  1. Cari sel di `cake_base_diameter_prices` untuk (base_option_id,
 *     diameter_id yang `diameter_cm`-nya cocok dengan `dimensionCm`).
 *     Ambil kolom sesuai `branch` (Pare / Semarang).
 *  2. Kalau tidak ada → pakai `override` dari form (admin isi manual).
 *  3. Kalau juga tidak ada → 0.
 *
 * Catatan: `cake_options.base_price_idr` lama TIDAK lagi dipakai
 * sebagai fallback — kolom dibiarkan ada di DB untuk order historis
 * (yang menyimpan harga snapshot per-row), tapi tidak lagi di-read
 * saat resolusi harga baru.
 */

import { branchPriceCol } from "./types";
import type {
  CakeBaseDiameterPrice,
  CakeBranch,
  CakeDiameterOption,
  CakeOption,
} from "./types";

export interface ResolveBasePriceInput {
  baseOption: Pick<CakeOption, "id"> | null | undefined;
  branch: CakeBranch;
  dimensionCm: number | null | undefined;
  diameters: Pick<CakeDiameterOption, "id" | "diameter_cm">[];
  prices: Pick<
    CakeBaseDiameterPrice,
    "base_option_id" | "diameter_id" | "price_pare_idr" | "price_semarang_idr"
  >[];
  override?: number | null;
}

export interface ResolvedBasePrice {
  price: number;
  source: "matrix" | "override" | "none";
}

export function resolveBasePrice({
  baseOption,
  branch,
  dimensionCm,
  diameters,
  prices,
  override,
}: ResolveBasePriceInput): ResolvedBasePrice {
  if (!baseOption) return { price: 0, source: "none" };

  if (dimensionCm != null && Number.isFinite(dimensionCm)) {
    const dia = diameters.find((d) => d.diameter_cm === dimensionCm);
    if (dia) {
      const cell = prices.find(
        (p) => p.base_option_id === baseOption.id && p.diameter_id === dia.id
      );
      const col = cell?.[branchPriceCol(branch)];
      if (col != null) return { price: Math.max(0, col), source: "matrix" };
    }
  }

  if (override != null && Number.isFinite(override) && override > 0) {
    return { price: Math.max(0, Math.round(override)), source: "override" };
  }

  return { price: 0, source: "none" };
}
