export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole, getCurrentProfile } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { getAdminHomeToday } from "@/lib/actions/admin-home.actions";
import { getPendingConfirmations } from "@/lib/actions/pending-confirmations.actions";
import { listOpenPayslipDisputes } from "@/lib/actions/payslip-disputes.actions";
import { getCelebrationsFeed } from "@/lib/actions/celebrations.actions";
import { AdminHomePage } from "@/components/admin/home/AdminHomePage";

/**
 * Admin Home / Today — the new landing surface for admins.
 *
 * Aggregates: live attendance snapshot + pending confirmations + open
 * payslip disputes + upcoming celebrations. Replaces the implicit
 * "land on /admin/attendance" behavior; sidebar Home tab points here.
 */
export default async function AdminHomeRoute() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const [profile, today, pending, disputes, celebrations] = await Promise.all([
    getCurrentProfile(),
    getAdminHomeToday(),
    getPendingConfirmations(),
    listOpenPayslipDisputes(),
    getCelebrationsFeed(),
  ]);

  // Resolve dispute → user lookup once so the client doesn't have to
  // round-trip per row.
  const supabase = await createClient();
  const disputeUserIds = Array.from(new Set(disputes.map((d) => d.userId)));
  const { data: userRows } = disputeUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, avatar_seed")
        .in("id", disputeUserIds)
    : { data: [] };
  const userDirectory: Record<
    string,
    { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }
  > = {};
  for (const u of userRows ?? []) {
    userDirectory[u.id] = {
      full_name: u.full_name,
      avatar_url: u.avatar_url,
      avatar_seed: u.avatar_seed,
    };
  }

  const greetingName =
    profile?.full_name?.trim()?.split(/\s+/)[0] ||
    profile?.email?.split("@")[0] ||
    "Admin";

  return (
    <AdminHomePage
      greetingName={greetingName}
      today={today}
      pendingConfirmations={pending}
      disputes={disputes}
      upcomingCelebrants={celebrations.upcoming}
      userDirectory={userDirectory}
    />
  );
}
