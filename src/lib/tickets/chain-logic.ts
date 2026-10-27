/**
 * Aturan murni hierarki tiket per ORANG (tanpa import, bisa diuji dan dipakai klien).
 *
 * Tiap karyawan punya nol, satu, atau beberapa atasan langsung per cabang (ticket_superiors). Tiket "naik" ditujukan ke
 * SATU atasan; yang punya dua atasan memilih. Tanpa atasan = langsung ke owner (admin), yang selalu puncak.
 */

/** handler_level: tiket dipegang owner (admin). */
export const OWNER_LEVEL = 99;
/** handler_level: tiket dipegang satu orang tertentu (`handler_id`). */
export const PERSON_LEVEL = 1;

export type Target = { kind: "owner" } | { kind: "person"; userId: string };

export type TargetResult = { ok: true; target: Target } | { ok: false; error: string };

/**
 * Tentukan tujuan tiket dari daftar atasan. 0 atasan → owner; 1 → orang itu; 2+ → `chosen` wajib salah satunya.
 * `chosen` yang bukan atasan selalu ditolak (kecuali tidak ada atasan sama sekali: diabaikan).
 */
export function resolveTarget(superiorIds: readonly string[], chosen?: string | null): TargetResult {
  const supers = Array.from(new Set(superiorIds));
  if (supers.length === 0) return { ok: true, target: { kind: "owner" } };
  if (chosen && !supers.includes(chosen)) return { ok: false, error: "Tujuan tiket harus salah satu atasanmu." };
  if (supers.length === 1) return { ok: true, target: { kind: "person", userId: supers[0] } };
  if (!chosen) return { ok: false, error: "Pilih atasan tujuan tiket." };
  return { ok: true, target: { kind: "person", userId: chosen } };
}

export interface Link {
  userId: string;
  superiorId: string;
}

/** Apakah menjadikan `superiorId` atasan `userId` menimbulkan putaran (A atasan B, B atasan A, dst)? */
export function wouldCreateCycle(links: readonly Link[], userId: string, superiorId: string): boolean {
  if (userId === superiorId) return true;
  // Naik dari superiorId lewat atasan-atasannya; bila bertemu userId berarti putaran.
  const seen = new Set<string>();
  const stack = [superiorId];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === userId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const l of links) if (l.userId === cur) stack.push(l.superiorId);
  }
  return false;
}

/** Label tampilan pemegang tiket. */
export function holderLabel(level: number, name?: string | null): string {
  if (level >= OWNER_LEVEL) return "Owner";
  return name?.trim() || "atasan";
}
