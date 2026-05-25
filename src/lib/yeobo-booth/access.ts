/**
 * Cached helper: apakah caller punya akses CRUD Yeobo Booth.
 *
 * Wraps server-side check (admin global ATAU yeobo_booth_admins
 * membership) di React `cache()` supaya sekali per-request dipakai
 * berkali-kali di layout + page + sidebar tanpa roundtrip ulang.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

export const isYeoboBoothAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("yeobo_booth_admins" as never)
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return Boolean(data);
});

export const canAccessYeoboBooth = cache(async (): Promise<boolean> => {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  return await isYeoboBoothAdmin();
});
