export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { LoginForm } from "@/components/auth/LoginForm";

/**
 * Auth landing at `/` — eliminates the legacy `/` → `/login` hop
 * (Lighthouse "Avoid multiple page redirects", 216 ms saved per
 * anonymous first visit).
 *
 * Authenticated users get the role-based bounce that used to live in
 * `app/page.tsx`. Anonymous users render the login form inline under
 * the existing `(auth)/layout.tsx` chrome (decorations + logo + lang
 * switcher) — no client redirect, no flash of empty content.
 */
export default async function AuthLandingRoute() {
  try {
    const user = await getCurrentUser();
    if (user) {
      const role = await getCurrentRole();
      redirect(role === "admin" ? "/admin" : "/dashboard");
    }
  } catch (err: unknown) {
    // Re-throw Next.js redirects — those are intentional control flow.
    if (
      err instanceof Error &&
      (err.message === "NEXT_REDIRECT" || "digest" in err)
    ) {
      throw err;
    }
    // Real errors (missing env, network) fall through to the login
    // form so the user always has a path forward.
  }
  return <LoginForm />;
}
