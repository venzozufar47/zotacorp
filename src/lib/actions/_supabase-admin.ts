import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role Supabase client for server actions.
 *
 * BYPASSES row-level security — only call this behind an auth gate
 * (see `_gates.ts`). Extracted here so the ~15 `*.actions.ts` modules
 * don't each re-declare the identical factory.
 */
export function createAdminClient() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
