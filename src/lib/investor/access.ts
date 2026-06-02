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

/**
 * Cabang Yeobo Space yang terhubung ke investor caller = distinct
 * `branch` non-null dari kontrak Yeobo miliknya. Dipakai untuk men-scope
 * tampilan per-cabang (Beranda + P&L). RLS `ic_self_read` membatasi ke
 * kontrak milik sendiri, jadi aman pakai client request-scoped.
 *
 * Kosong = investor belum dihubungkan ke cabang manapun (jangan fallback
 * ke semua cabang — itu kebocoran).
 */
export const getMyConnectedYeoboBranches = cache(
  async (): Promise<string[]> => {
    const user = await getCurrentUser();
    if (!user) return [];
    const supabase = await createClient();
    const { data } = await supabase
      .from("investor_contracts" as never)
      .select("branch")
      .eq("user_id", user.id)
      .eq("business_unit", "Yeobo Space")
      .not("branch", "is", null);
    const set = new Set<string>();
    for (const r of (data ?? []) as unknown as Array<{ branch: string | null }>) {
      if (r.branch) set.add(r.branch);
    }
    return Array.from(set).sort();
  }
);
