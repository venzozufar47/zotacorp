/**
 * Cached access helper Evaluasi 360°.
 *
 *  - hasPending360Evaluation() : punya ≥1 evaluasi peer yang belum
 *    disubmit di round aktif manapun. Dipakai untuk nav tab kondisional
 *    (Sidebar/BottomNav), pola sama dengan `src/lib/tickets/access.ts`.
 */

import { cache } from "react";
import { getMyPending360Evaluations } from "@/lib/actions/evaluation-360.actions";

export const hasPending360Evaluation = cache(async (): Promise<boolean> => {
  const { items } = await getMyPending360Evaluations();
  return items.some((i) => !i.submitted);
});
