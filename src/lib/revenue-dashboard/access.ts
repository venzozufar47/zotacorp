/**
 * Cached helper: apakah caller boleh lihat kartu Omzet di beranda mereka
 * (admin global ATAU revenue_dashboard_viewers membership) -- per SCOPE:
 * 'haengbocake' (POS+Cake Pare/Semarang) dan 'yeobo' (Yeobo Space) bisa
 * di-assign terpisah, satu user bisa punya salah satu atau keduanya.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

export type RevenueDashboardScope = "haengbocake" | "yeobo";

const isRevenueDashboardScopeViewer = cache(
  async (scope: RevenueDashboardScope): Promise<boolean> => {
    const user = await getCurrentUser();
    if (!user) return false;
    const supabase = await createClient();
    const { data } = await supabase
      .from("revenue_dashboard_viewers" as never)
      .select("user_id")
      .eq("user_id", user.id)
      .eq("scope", scope)
      .maybeSingle();
    return Boolean(data);
  }
);

export const canViewRevenueDashboard = cache(
  async (scope: RevenueDashboardScope): Promise<boolean> => {
    const role = await getCurrentRole();
    if (role === "admin") return true;
    return await isRevenueDashboardScopeViewer(scope);
  }
);
