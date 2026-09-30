/**
 * Cached helper: apakah caller boleh lihat dashboard Meta Ads Insights
 * (/admin/ads) — admin global ATAU meta_ads_viewers membership. Pola
 * identik `yeobo-booth/access.ts`.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

export const isMetaAdsViewer = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("meta_ads_viewers" as never)
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return Boolean(data);
});

export const canAccessMetaAds = cache(async (): Promise<boolean> => {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  return await isMetaAdsViewer();
});
