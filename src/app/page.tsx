export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";

export default async function RootPage() {
  try {
    const user = await getCurrentUser();
    if (!user) redirect("/login");

    const role = await getCurrentRole();
    redirect(role === "admin" ? "/admin/attendance" : "/dashboard");
  } catch (err: unknown) {
    // If it's a Next.js redirect, re-throw it — those are intentional
    if (
      err instanceof Error &&
      (err.message === "NEXT_REDIRECT" || "digest" in err)
    ) {
      throw err;
    }
    // Any real error (e.g. missing env var, network) → safe fallback
    redirect("/login");
  }
}
