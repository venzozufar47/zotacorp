/**
 * Pengelompokan Business Unit + Cabang untuk registri admin (Subscription &
 * Akun). SENGAJA berdiri sendiri — tidak terhubung ke PnL/keuangan — jadi
 * daftar cabang ditulis di sini dan tidak mengikuti perubahan kode keuangan.
 */
const HAENGBOCAKE_BRANCHES = ["Pusat", "Semarang", "Pare", "Mamaya"] as const;
const YEOBO_BRANCHES = ["Tlogosari", "Tembalang", "Jebres"] as const;

/** "Umum" = biaya/akun lintas unit (tidak milik satu BU). */
export const GENERAL_BU = "Umum";

/**
 * "Pribadi" = milik owner pribadi, BUKAN biaya bisnis. Diperlakukan sebagai
 * "unit" biasa di data (teks), tapi total biaya bisnis di halaman
 * Subscription tidak menghitungnya.
 */
export const PERSONAL_BU = "Pribadi";

export const REGISTRY_BUSINESS_UNITS = [
  "Haengbocake",
  "Yeobo Space",
  "Yeobo Booth",
  "Mamaya House",
  "Gritamora",
  GENERAL_BU,
  PERSONAL_BU,
] as const;

export function isPersonalBu(bu: string): boolean {
  return bu === PERSONAL_BU;
}

export function buLabel(bu: string): string {
  if (bu === GENERAL_BU) return "Umum (lintas unit)";
  if (bu === PERSONAL_BU) return "Pribadi (owner)";
  return bu;
}

/** Pilihan cabang untuk satu BU. Kosong = BU tanpa cabang (dropdown disembunyikan). */
export function branchesFor(bu: string): readonly string[] {
  if (bu === "Haengbocake") return HAENGBOCAKE_BRANCHES;
  if (bu === "Yeobo Space") return YEOBO_BRANCHES;
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
