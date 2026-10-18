import type { SpLevel } from "@/lib/actions/cleaning-review.actions";

/**
 * Dipisah dari `cleaning-review.actions.ts` karena file `"use server"`
 * hanya boleh mengekspor async function — sama alasan dengan
 * `lib/leave/constants.ts` (lihat komentarnya).
 */
export const SP_LEVEL_LABEL: Record<SpLevel, string> = {
  teguran: "Teguran lisan tercatat",
  sp1: "SP1",
  sp2: "SP2",
  sp3: "SP3",
};
