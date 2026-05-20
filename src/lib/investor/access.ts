import { cache } from "react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-request memoised snapshot dari hak akses investor caller.
 * Sama pola dengan `getMyCakeAccess`. UI tinggal panggil ini di
 * page-level untuk decide:
 *   - investor.businessUnits.length === 0 → render "menunggu
 *     assignment" state
 *   - investor.businessUnits.includes(bu) → boleh buka
 *     /investor/finance/<bu>
 */
export const getMyInvestorAccess = cache(
  async (): Promise<{ businessUnits: string[] }> => {
    const user = await getCurrentUser();
    if (!user) return { businessUnits: [] };
    const supabase = await createClient();
    const { data } = await supabase
      .from("investor_business_unit_assignments" as never)
      .select("business_unit")
      .eq("user_id", user.id);
    const set = new Set<string>();
    for (const r of (data ?? []) as unknown as Array<{ business_unit: string }>) {
      set.add(r.business_unit);
    }
    return { businessUnits: Array.from(set).sort() };
  }
);
