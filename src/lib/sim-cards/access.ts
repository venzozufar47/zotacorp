/**
 * Cached access helpers manajemen kartu SIM.
 *
 *  - isSimPic()           : punya ≥1 kartu aktif sebagai penanggung jawab.
 *  - canManageSimCards()  : admin — kelola semua nomor & unit bisnis.
 *  - canOpenSimCards()    : admin ATAU PIC (menentukan nav /sim-cards).
 *
 * Semua di React `cache()` — sekali per-request, dipakai layout + page +
 * sidebar. Pola `src/lib/tickets/access.ts`.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

/** PIC = tercatat sebagai pic_user_id di minimal satu kartu aktif. */
export const isSimPic = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("sim_cards" as never)
    .select("id")
    .eq("pic_user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
});

/** Admin — kelola seluruh nomor lintas unit bisnis. */
export const canManageSimCards = cache(async (): Promise<boolean> => {
  const role = await getCurrentRole();
  return role === "admin";
});

/** Boleh membuka halaman kartu SIM: admin atau PIC. */
export const canOpenSimCards = cache(async (): Promise<boolean> => {
  if (await canManageSimCards()) return true;
  return await isSimPic();
});
