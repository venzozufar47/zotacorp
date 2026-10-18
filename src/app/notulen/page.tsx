export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { isTeamLeader } from "@/lib/tasks/team-access";

/**
 * Briefing Kilat tidak punya halaman sendiri lagi: kepala tim mencatatnya di halaman
 * Tim, superadmin membacanya di tab Briefing Kilat. Rute ini hanya mengalihkan supaya
 * tautan lama tidak mati.
 */
export default async function NotulenRedirectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) === "admin") redirect("/admin/briefing");
  if (await isTeamLeader()) redirect("/tim?bagian=briefing");
  redirect("/dashboard");
}
