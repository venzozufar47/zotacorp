/**
 * Helper cabang POS. URL publik `/pospare` & `/possemarang` di-rewrite ke
 * route dinamis internal `/pos/[branch]` (param = "pare" | "semarang").
 * Karena "pos" + "pare" = "pospare", basePath cukup `\`/pos${param}\``.
 */

export type PosBranchParam = "pare" | "semarang";
export type PosBranchName = "Pare" | "Semarang";

const PARAM_TO_NAME: Record<PosBranchParam, PosBranchName> = {
  pare: "Pare",
  semarang: "Semarang",
};

/** Validasi & normalisasi segmen `[branch]` → nama cabang, atau null. */
export function posBranchFromParam(param: string): PosBranchName | null {
  return PARAM_TO_NAME[param as PosBranchParam] ?? null;
}

/** Base path publik untuk nav link, mis. "pare" → "/pospare". */
export function posBasePath(param: string): string {
  return `/pos${param}`;
}

/** Nama cabang → base path publik, mis. "Semarang" → "/possemarang". */
export function posBasePathForBranch(branch: PosBranchName): string {
  return `/pos${branch.toLowerCase()}`;
}

/** Cabang kanonik saat URL tidak menyebut cabang. */
export const POS_DEFAULT_BRANCH: PosBranchParam = "pare";

/**
 * Sub-halaman POS. Dipakai proxy untuk menyelamatkan deep-link tanpa cabang
 * seperti `/pos/insights?from=…` — tanpa daftar ini, "insights" terbaca
 * sebagai nama cabang, ditolak guard, dan pengguna mendarat di halaman utama
 * POS tanpa membawa query-nya.
 *
 * Segmen yang TIDAK ada di sini tetap ditangani guard `[branch]` (→ halaman
 * utama), jadi URL ngawur tidak berubah jadi 404. Tambahkan entri baru saat
 * membuat folder baru di `src/app/pos/[branch]/`.
 */
export const POS_SUBPAGES = [
  "insights",
  "pesanan",
  "produk",
  "riwayat",
  "service-level",
  "shift",
  "stok",
] as const;

/** Segmen pertama setelah `/pos/` yang sebenarnya sub-halaman, bukan cabang. */
export function posSubpageFromParam(param: string): string | null {
  return (POS_SUBPAGES as readonly string[]).includes(param) ? param : null;
}
