import {
  HAENGBOCAKE_BRANCHES,
  YEOBO_BRANCH_ORDER,
} from "@/lib/cashflow/categories";

/**
 * Pengelompokan Business Unit + Cabang untuk registri admin (Subscription &
 * Akun). Cabang diambil dari konstanta yang sama dengan PnL supaya daftarnya
 * tidak pernah drift dari yang dipakai keuangan.
 */

/** "Umum" = biaya/akun lintas unit (tidak milik satu BU). */
export const GENERAL_BU = "Umum";

export const REGISTRY_BUSINESS_UNITS = [
  "Haengbocake",
  "Yeobo Space",
  "Yeobo Booth",
  "Mamaya House",
  "Gritamora",
  GENERAL_BU,
] as const;

export function buLabel(bu: string): string {
  return bu === GENERAL_BU ? "Umum (lintas unit)" : bu;
}

/** Pilihan cabang untuk satu BU. Kosong = BU tanpa cabang (dropdown disembunyikan). */
export function branchesFor(bu: string): readonly string[] {
  if (bu === "Haengbocake") return HAENGBOCAKE_BRANCHES;
  if (bu === "Yeobo Space") return YEOBO_BRANCH_ORDER;
  return [];
}

/** Urutan tampil grup: BU yang dikenal dulu sesuai daftar, sisanya alfabetis. */
export function compareBu(a: string, b: string): number {
  const order = REGISTRY_BUSINESS_UNITS as readonly string[];
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia !== -1 || ib !== -1) {
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  }
  return a.localeCompare(b);
}
