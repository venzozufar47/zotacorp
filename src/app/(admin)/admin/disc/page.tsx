export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { getDiscOverview } from "@/lib/actions/disc.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { DiscOverviewManager } from "@/components/admin/disc/DiscOverviewManager";

export default async function AdminDiscPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const { rows } = await getDiscOverview();

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Tes Kepribadian DISC"
        subtitle="Minta (push) karyawan mengambil tes DISC, lihat hasilnya, atau import hasil dari PDF Frexor. Karyawan yang di-push tidak bisa melihat slip gaji sampai tesnya selesai."
      />
      <DiscOverviewManager rows={rows} />
    </div>
  );
}
