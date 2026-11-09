export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/supabase/cached";
import { loadRoster } from "@/lib/employees/roster";
import { CONTRACT_LABEL, contractState } from "@/lib/employees/lifecycle";
import { HubTabs, type HubTab } from "@/components/admin/karyawan/HubTabs";
import { RosterList, type RosterRow } from "@/components/admin/karyawan/RosterList";
import { ActionQueue, type QueueItem } from "@/components/admin/karyawan/ActionQueue";
import { CelebrationStrip } from "@/components/admin/karyawan/CelebrationStrip";
import { listEmployeeMonitoring } from "@/lib/actions/employee-monitoring.actions";

export default async function KaryawanHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const { tab: rawTab } = await searchParams;
  const tab: HubTab = rawTab === "tindakan" ? "tindakan" : "daftar";

  const [roster, monitoring] = await Promise.all([
    loadRoster(),
    tab === "daftar" ? listEmployeeMonitoring() : Promise.resolve({ data: [] }),
  ]);
  const ownerActionCount = roster.reduce(
    (n, e) => n + e.actions.filter((a) => a.owner === "owner" && a.severity !== "info").length,
    0
  );
  const activeCount = roster.filter((e) => e.facts.isActive).length;

  return (
    <div className="space-y-4 animate-fade-up">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Karyawan</h1>
        <p className="text-sm text-muted-foreground">{activeCount} aktif</p>
      </div>
      <HubTabs active={tab} actionCount={ownerActionCount} />

      {tab === "daftar" && <CelebrationStrip rows={monitoring.data} />}

      {tab === "daftar" ? (
        <RosterList
          rows={roster.map<RosterRow>((e) => ({
            id: e.profile.id,
            name: e.profile.full_name ?? "",
            email: e.profile.email,
            avatarUrl: e.profile.avatar_url ?? null,
            avatarSeed: e.profile.avatar_seed ?? null,
            jobRole: e.profile.job_role ?? null,
            unit: e.profile.business_unit ?? null,
            isAdmin: e.facts.isAdmin,
            stage: e.stage,
            contractLabel: CONTRACT_LABEL[contractState(e.facts)],
            nextAction: e.actions[0]
              ? { label: e.actions[0].label, severity: e.actions[0].severity, tab: e.actions[0].tab }
              : null,
            actionCount: e.actions.length,
          }))}
        />
      ) : (
        <ActionQueue
          items={roster.flatMap<QueueItem>((e) =>
            e.actions.map((action) => ({
              employeeId: e.profile.id,
              name: e.profile.full_name || e.profile.email,
              action,
            }))
          )}
        />
      )}
    </div>
  );
}
