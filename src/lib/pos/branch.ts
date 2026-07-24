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
