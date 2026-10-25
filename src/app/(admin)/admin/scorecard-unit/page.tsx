export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { getThresholdAdmin, listPeriods } from "@/lib/actions/unit-scorecard.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { ScorecardAdmin } from "@/components/admin/scorecard/ScorecardAdmin";

/**
 * Scorecard Unit Bisnis, pengaturan superadmin: tutup/buka ulang buku per bulan, ambang berversi (wajib alasan),
 * tanggal buka & ramp-up unit, modal awal, dan input rating Google.
 */
export default async function AdminScorecardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if ((await getCurrentRole()) !== "admin") redirect("/dashboard");

  const [periods, admin] = await Promise.all([listPeriods(), getThresholdAdmin()]);

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Scorecard Unit Bisnis"
        subtitle="Tutup buku bulanan, ambang hijau/kuning/merah, tanggal buka unit, modal awal, dan rating Google."
      />
      {!periods.ok || !admin.ok ? (
        <p className="text-sm text-destructive">{!periods.ok ? periods.error : !admin.ok ? admin.error : ""}</p>
      ) : (
        <ScorecardAdmin periods={periods.data ?? []} admin={admin.data!} />
      )}
    </div>
  );
}
