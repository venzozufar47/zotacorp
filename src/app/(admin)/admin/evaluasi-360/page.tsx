export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentRole } from "@/lib/supabase/cached";
import { createClient } from "@/lib/supabase/server";
import { getRoundsOverview } from "@/lib/actions/evaluation-360.actions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Evaluation360RoundsManager } from "@/components/admin/evaluation-360/Evaluation360RoundsManager";

export default async function AdminEvaluasi360Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/dashboard");

  const supabase = await createClient();
  const [{ rows }, { data: profiles }] = await Promise.all([
    getRoundsOverview(),
    supabase
      .from("profiles")
      .select("id, full_name, nickname, business_unit, job_role, is_probation")
      .eq("role", "employee")
      .eq("is_active", true)
      .is("resigned_at", null)
      .order("full_name"),
  ]);

  const employees = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.nickname || p.full_name || "—",
    businessUnit: p.business_unit,
    jobRole: p.job_role,
    isProbation: Boolean(p.is_probation),
  }));

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Evaluasi 360°"
        subtitle="Push kuisioner evaluasi ke sekelompok karyawan — semua yang dipilih saling menilai satu sama lain. Hasil hanya bisa dilihat admin."
      />
      <Evaluation360RoundsManager rounds={rows} employees={employees} />
    </div>
  );
}
