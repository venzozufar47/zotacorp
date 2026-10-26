/**
 * Aturan murni rantai hierarki tiket (tanpa import, bisa diuji dan dipakai klien).
 * Tingkat = angka 1..8 di ticket_chain_members; OWNER_LEVEL (99) = owner/admin, selalu puncak.
 */

/** Tingkat "owner" (admin Zota): selalu paling atas, tidak disimpan di ticket_chain_members. */
export const OWNER_LEVEL = 99;

export interface ChainMember {
  userId: string;
  level: number;
}

/** Tingkat terendah yang punya anggota (tempat tiket baru mendarat); owner bila rantai kosong. */
export function firstLevel(chain: ChainMember[]): number {
  return chain.length > 0 ? Math.min(...chain.map((m) => m.level)) : OWNER_LEVEL;
}

/** Tingkat berikutnya di atas `level` yang punya anggota; owner bila sudah tidak ada. */
export function nextLevelAbove(chain: ChainMember[], level: number): number {
  const above = chain.filter((m) => m.level > level && m.level < OWNER_LEVEL).map((m) => m.level);
  return above.length > 0 ? Math.min(...above) : OWNER_LEVEL;
}

/** Tingkat tepat di bawah `level` yang punya anggota (untuk mengembalikan eskalasi yang ditolak); null bila tidak ada. */
export function levelBelow(chain: ChainMember[], level: number): number | null {
  const below = chain.filter((m) => m.level < level).map((m) => m.level);
  return below.length > 0 ? Math.max(...below) : null;
}

/** Label tampilan sebuah tingkat. */
export function levelLabel(level: number): string {
  return level >= OWNER_LEVEL ? "Owner" : `Tingkat ${level}`;
}
