import { cache } from "react";
import { getCurrentUser } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-request memoised snapshot of the caller's cake-feature access.
 * Used by the employee layout to decide which nav tabs to show; gates
 * in `_gates.ts` re-fetch independently to keep the security check
 * decoupled from any caching mistakes here. Same pattern as
 * `getCurrentUser` / `getCurrentRole` in `lib/supabase/cached.ts`.
 */
export const getMyCakeAccess = cache(
  async (): Promise<{ hasOrders: boolean; hasProduction: boolean }> => {
    const user = await getCurrentUser();
    if (!user) return { hasOrders: false, hasProduction: false };
    const supabase = await createClient();
    const { data } = await supabase
      .from("cake_access_assignments" as never)
      .select("scope")
      .eq("user_id", user.id);
    const scopes = ((data ?? []) as unknown as Array<{ scope: string }>).map(
      (r) => r.scope
    );
    return {
      hasOrders: scopes.includes("orders"),
      hasProduction: scopes.includes("production"),
    };
  }
);
