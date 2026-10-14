/**
 * Akses pemilik SOP — menentukan apakah menu "SOP saya" muncul untuk
 * karyawan. Pola `src/lib/sim-cards/access.ts`: `cache()` sekali per-request.
 */

import { cache } from "react";
import { createAdminClient } from "@/lib/actions/_supabase-admin";
import { getCurrentUser } from "@/lib/supabase/cached";

/** Pemilik = tercatat sebagai owner_id di minimal satu SOP AKTIF. */
export const isSopOwner = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  // Service role terkunci ke user ini: RLS tabel SOP tak mengizinkan karyawan
  // membaca daftar pemilik, dan yang dicek hanya milik user itu sendiri.
  const { data } = await createAdminClient()
    .from("cleaning_checklists")
    .select("id")
    .eq("owner_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
});
