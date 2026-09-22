/**
 * Cached helper: apakah caller boleh lihat kartu Omzet di beranda mereka
 * (admin global ATAU revenue_dashboard_viewers membership). Sama pola
 * dengan isYeoboBoothAdmin/isCakeFinanceAdmin.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

export const isRevenueDashboardViewer = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("revenue_dashboard_viewers" as never)
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return Boolean(data);
});

export const canViewRevenueDashboard = cache(async (): Promise<boolean> => {
  const role = await getCurrentRole();
  if (role === "admin") return true;
  return await isRevenueDashboardViewer();
});
