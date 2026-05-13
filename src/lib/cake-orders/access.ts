import { cache } from "react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import type { CakeBranch } from "@/lib/cake-orders/types";

/**
 * Per-request memoised snapshot of the caller's cake-feature access.
 * Used by the employee layout to decide which nav tabs to show; gates
 * in `_gates.ts` re-fetch independently to keep the security check
 * decoupled from any caching mistakes here. Same pattern as
 * `getCurrentUser` / `getCurrentRole` in `lib/supabase/cached.ts`.
 *
 * `productionBranches` — cabang mana saja user boleh lihat slip
 * produksi-nya. Admin tetap akses semua via role='admin'; field ini
 * khusus untuk role 'production' yang sekarang branch-spesifik.
 */
export const getMyCakeAccess = cache(
  async (): Promise<{
    hasOrders: boolean;
    hasProduction: boolean;
    productionBranches: CakeBranch[];
  }> => {
    const user = await getCurrentUser();
    if (!user)
      return { hasOrders: false, hasProduction: false, productionBranches: [] };
    const supabase = await createClient();
    const { data } = await supabase
      .from("cake_access_assignments" as never)
      .select("scope, branch")
      .eq("user_id", user.id);
    const rows = (data ?? []) as unknown as Array<{
      scope: string;
      branch: CakeBranch | null;
    }>;
    const branches = new Set<CakeBranch>();
    let hasOrders = false;
    let hasProduction = false;
    for (const r of rows) {
      if (r.scope === "orders") hasOrders = true;
      if (r.scope === "production") {
        hasProduction = true;
        if (r.branch) branches.add(r.branch);
      }
    }
    return {
      hasOrders,
      hasProduction,
      productionBranches: Array.from(branches),
    };
  }
);
