export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    redirect(profile?.role === "admin" ? "/admin/attendance" : "/dashboard");
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
